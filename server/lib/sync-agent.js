/* @flow */
import _ from "lodash";
import Bottleneck from "bottleneck";
import moment from "moment";
import CustomerioClient from "./customerio-client";

export default class SyncAgent {
  customerioClient: CustomerioClient;
  metric: Object;
  client: Object;
  idMapping: string;
  bottleneck: Bottleneck;
  userAttributesMapping: Array<string>;

  constructor(ctx: Object, bottleneck: Bottleneck) {
    const { ship, client, metric } = ctx;
    this.customerioClient = new CustomerioClient(_.get(ship, "private_settings.site_id"), _.get(ship, "private_settings.api_key"));
    this.metric = metric;
    this.client = client;

    this.idMapping = _.get(ship, "private_settings.user_id_mapping", "external_id");
    this.userAttributesMapping = _.get(ship, "private_settings.synchronized_attributes", []);
    this.bottleneck = bottleneck;
  }

  isConfigured() {
    return this.customerioClient.isConfigured();
  }

  sendBatchOfUsers(users: Array<Object>) {
    return Promise.all(users.map(user => this.sendAllUserProperties(user)));
  }

  deleteBatchOfUsers(users: Array<Object>) {
    return Promise.all(users.map(user => this.deleteUser(user)));
  }

  getUsersCustomerioId(user: Object) {
    return _.get(user, this.idMapping, _.get(user, "traits_customerio/id"));
  }

  getIdMapping() {
    return this.idMapping;
  }

  sendAllUserProperties(user: Object) {
    const email = _.get(user, "email");
    if (!email) {
      this.client.logger.info("outgoing.user.skip", { id: user[this.idMapping], reason: "Missing email" });
      return Promise.resolve();
    }

    const alreadySetCustomerId = _.has(user, "traits_customerio/id");
    const userCustomerioId = this.getUsersCustomerioId(user);

    if (!userCustomerioId) {
      this.client.logger.info("outgoing.user.skip", { id: user[this.idMapping], reason: "Missing id" });
      return Promise.resolve();
    }

    const created_at = Date.now() / 1000;
    const userIdent = { email };

    let filteredHullUserTraits = _.pick(user, this.userAttributesMapping);

    if (!alreadySetCustomerId) {
      filteredHullUserTraits = _.merge({ created_at }, filteredHullUserTraits);
    }
    filteredHullUserTraits = _.merge({ email: userIdent.email }, filteredHullUserTraits);

    const hullUserTraits = _.mapKeys(
      _.merge({ id: userCustomerioId }, filteredHullUserTraits),
      ((value, key) => `traits_customerio/${key}`)
    );

    return Promise.all(
      (_.chunk(_.toPairs(filteredHullUserTraits), 30))
        .map(_.fromPairs)
        .map(userData => this.bottleneck.schedule(this._sendUsersProperties.bind(this), userCustomerioId, userData))
    )
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.user.success");
        this.metric.increment("ship.outgoing.users", 1);
        return this.client.asUser(userIdent).traits(
          hullUserTraits
        );
      })
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.user.error", { errors: err }));
  }

  deleteUser(user: Object) {
    return this.bottleneck.schedule(this._deleteUser.bind(this), user)
      .then(() => {
        this.client.asUser(user).logger.debug("user.deletion.success");
        return this.client.asUser(user).traits({ "traits_customerio/deleted_at": moment().format() });
      })
      .catch((err) => this.client.asUser(user).logger.debug("user.deletion.error", { errors: err }));
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.bottleneck.schedule(this.customerioClient.sendAnonymousEvent.bind(this.customerioClient), eventName, eventData)
      .then(() => {
        this.client.logger.info("outgoing.event.success", { eventName, eventData });
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch((err) => this.client.logger.error("outgoing.event.error", { eventName, eventData, errors: err }));
  }

  sendPageEvent(userIdent: Object, page: string, event: Object) {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.bottleneck.schedule(this.customerioClient.sendPageViewEvent.bind(this.customerioClient), id, page, event)
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.event.success");
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err }));
  }

  sendUserEvent(userIdent: Object, eventName: string, eventData: Object) {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.bottleneck.schedule(this.customerioClient.sendCustomerEvent.bind(this.customerioClient), id, eventName, eventData)
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.event.success");
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err }));
  }

  /**
   * Allows to delete user from customer.io
   * This method should be called only with this.bottleneck.schedule(...)
   * @param userIdent
   * @returns {Promise}
   * @private
   */

  _deleteUser(userIdent: Object) {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.debug("user.deletion.skip", { userIdent, reason: "Missing id" });
      return Promise.resolve();
    }

    return this.customerioClient.deleteUser(id);
  }

  /**
   * Allows to send user properties to customer.io
   * This method should be called only with this.bottleneck.schedule(...)
   * @param userId
   * @param userAttributes
   * @private
   */

  _sendUsersProperties(userId: string, userAttributes: Object) {
    this.client.logger.debug("outgoing.user.progress", { userPropertiesSent: Object.keys(userAttributes).length });
    return this.customerioClient.identify(userId, userAttributes);
  }
}
