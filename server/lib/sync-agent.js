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
    this.customerioClient = new CustomerioClient(_.get(ship.private_settings, "customerio_site_id"), _.get(ship.private_settings, "customerio_api_key"));
    this.metric = metric;
    this.client = client;

    this.idMapping = _.get(ship.private_settings, "hull_user_id_mapping", "external_id");
    this.userAttributesMapping = _.get(ship.private_settings, "sync_fields_to_customerio", []);
    this.bottleneck = bottleneck;
  }

  isConfigured() {
    return !!this.idMapping && this.customerioClient.isConfigured();
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

    const alreadySetCustomerId = _.get(user, "traits_customerio/id");
    const userCustomerioId = _.get(user, this.idMapping, alreadySetCustomerId);

    if (!userCustomerioId) {
      this.client.logger.info("outgoing.user.skip", { id: user[this.idMapping], reason: "Missing id" });
      return Promise.resolve();
    }

    const created_at = Date.now() / 1000;
    const userIdent = { email };

    const filteredAttributes = _.pick(user, this.userAttributesMapping);

    let filteredAndMappedAttributes = _.mapKeys(filteredAttributes, (value, key) => {
      return _.get(_.find(this.userAttributesMapping, elem => elem.hull === key), "name") || key;
    });

    if (!alreadySetCustomerId) {
      filteredAndMappedAttributes = _.merge(filteredAttributes, { created_at, email });
    }

    return Promise.all(
      (_.chunk(_.toPairs(filteredAndMappedAttributes), 30))
        .map(_.fromPairs)
        .map(userData => this.bottleneck.schedule(this._sendUsersProperties.bind(this), userCustomerioId, userIdent, userData))
    )
      .then(() => {
        this.metric.increment("ship.outgoing.users", 1);
        return this.client.asUser(userIdent).traits(_.merge(filteredAttributes, { "traits_customerio/id": userCustomerioId }));
      });
  }

  deleteUser(user: Object) {
    return this.bottleneck.schedule(this._deleteUser.bind(this), user)
      .then(() => this.client.asUser(user).traits({ "traits_customerio/deleted_at": moment().format() }));
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.bottleneck.schedule(this.customerioClient.sendAnonymousEvent.bind(this), eventName, eventData)
      .then(() => {
        this.client.logger.info("outgoing.event.success", { eventName, eventData });
        this.metric.increment("ship.outgoing.events", 1);
      })
      .catch((err) => this.client.logger.error("outgoing.event.error", { eventName, eventData, errors: err }));
  }

  sendPageEvent(userIdent: Object, page: string, event: Object) {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.bottleneck.schedule(this.customerioClient.sendPageViewEvent.bind(this), id, page, event)
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

    return this.bottleneck.schedule(this.customerioClient.sendCustomerEvent.bind(this), id, eventName, eventData)
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

    return this.customerioClient.deleteUser(id)
      .then(() => this.client.asUser(userIdent).logger.debug("user.deletion.success"))
      .catch((err) => this.client.asUser(userIdent).logger.debug("user.deletion.error", { errors: err }));
  }

  /**
   * Allows to send user properties to customer.io
   * This method should be called only with this.bottleneck.schedule(...)
   * @param userIdent
   * @param userId
   * @param userTraits
   * @private
   */

  _sendUsersProperties(userId: string, userIdent: Object, userTraits: Object) {
    this.client.logger.debug("outgoing.user.progress", { userPropertiesSent: Object.keys(userTraits).length });
    return this.customerioClient.identify(userId, userTraits)
      .then(() => this.client.asUser(userIdent).logger.info("outgoing.user.success"))
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.user.error", { errors: err }));
  }
}
