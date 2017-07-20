import _ from "lodash";
import Bottleneck from "bottleneck";
import CustomerioClient from "./customerio-client";

export default class SyncAgent {
  customerioClient: CustomerioClient;
  metric: any;
  client: any;
  idMapping: string;
  bottleneck: Bottleneck;
  userAttributesMapping: Array<string>;

  constructor(ctx: any, bottleneck: Bottleneck, customerioSiteId: string, customerioApiKey: string, idMapping: string) {
    const { ship, client, metric } = ctx;
    this.customerioClient = new CustomerioClient(customerioSiteId, customerioApiKey);
    this.metric = metric;
    this.client = client;

    this.idMapping = idMapping;
    this.userAttributesMapping = _.get(ship.private_settings, "sync_fields_to_customerio", []);
    this.bottleneck = bottleneck;
  }

  isConfigured() {
    return !!this.idMapping && this.customerioClient.isConfigured();
  }

  sendBatchOfUsers(users: Array<any>) {
    return users.forEach(user => this.sendAllUserProperties(user));
  }

  deleteBatchOfUsers(users: Array<any>) {
    return users.forEach(user => this.bottleneck.schedule(this._deleteUser.bind(this), user));
  }

  getUsersCustomerioId(user) {
    return _.get(user, this.idMapping);
  }

  getIdMapping() {
    return this.idMapping;
  }

  sendAllUserProperties(user: any) {
    const email = _.get(user, "email");
    if (!email) {
      this.client.logger.info("outgoing.user.skip", { id: user[this.idMapping], reason: "Missing email" });
      return Promise.resolve();
    }

    const userCustomerioId = _.get(user, this.idMapping, _.get(user, "traits_customerio/id"));

    if (!userCustomerioId) {
      this.client.logger.info("outgoing.user.skip", { id: user[this.idMapping], reason: "Missing id" });
      return Promise.resolve();
    }

    const created_at = Date.now() / 1000;
    const userIdent = { hull_id: userCustomerioId, email };

    const filteredAttributes = _.pick(user, this.userAttributesMapping);

    let filteredAndMappedAttributes = _.mapKeys(filteredAttributes, (value, key) => {
      return _.get(_.find(this.userAttributesMapping, elem => elem.hull === key), "name") || key;
    });

    if (!_.get(user, "traits_customerio/id")) {
      filteredAndMappedAttributes = _.merge(filteredAttributes, { created_at });
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

  saveAnonymousEvent(eventName: string, eventData: any) {
    return this.bottleneck.schedule(this.customerioClient.sendAnonymousEvent.bind(this), eventName, eventData)
      .then(() => {
        this.client.logger.info("outgoing.event.success", { eventName, eventData });
        this.metric.increment("ship.outgoing.events", 1);
      })
      .catch((err) => this.client.logger.error("outgoing.event.error", { eventName, eventData, errors: err }));
  }

  savePageEvent(userIdent: any, page: string, event: any) {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.bottleneck.schedule(this.customerioClient.sendPageViewEvent.bind(this), id, page, event)
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.event.success");
        this.metric.increment("ship.outgoing.events", 1);
      })
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err }));
  }

  saveUserEvent(userIdent: any, eventName: string, eventData) {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.bottleneck.schedule(this.customerioClient.sendCustomerEvent.bind(this), id, eventName, eventData)
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.event.success");
        this.metric.increment("ship.outgoing.events", 1);
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

  _deleteUser(userIdent: any) {
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
   * @param userTraits
   * @private
   */

  _sendUsersProperties(userIdent: any, userTraits: any) {
    const id = this.getUsersCustomerioId(userIdent);

    this.client.logger.debug("outgoing.user.progress", { userPropertiesSent: Object.keys(userTraits).length });
    return this.customerioClient.identify(id, {
      ...userTraits
    })
      .then(() => this.client.asUser(userIdent).logger.info("outgoing.user.success"))
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.user.error", { errors: err }));
  }
}
