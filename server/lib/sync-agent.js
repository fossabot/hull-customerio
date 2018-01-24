/* @flow */
import _ from "lodash";
import moment from "moment";
import CustomerioClient from "./customerio-client";
import AttributesMapper from "./attributes-mapper";

export default class SyncAgent {
  customerioClient: CustomerioClient;
  metric: Object;
  client: Object;
  idMapping: string;
  userAttributesMapping: Array<string>;

  constructor({ ship, client, metric }: Object, customerioClient: CustomerioClient) {
    this.customerioClient = customerioClient;
    this.metric = metric;
    this.client = client;

    this.idMapping = _.get(ship, "private_settings.user_id_mapping", "external_id");
    this.userAttributesMapping = _.get(ship, "private_settings.synchronized_attributes", []);
  }

  isConfigured() {
    return this.customerioClient.isConfigured();
  }

  checkAuth() {
    return this.customerioClient.checkAuth();
  }

  sendBatchOfUsers(messages: Array<Object>) {
    return Promise.all(messages.map(message => this.sendAllUserProperties(message.user, message.segments)));
  }

  deleteBatchOfUsers(users: Array<Object>) {
    return Promise.all(users.filter(user => {
      if (_.has(user, "traits_customerio/deleted_at")) {
        this.client.asUser(user).logger.info("outgoing.deletion.skip", { reason: "User already deleted" });
        return false;
      }

      if (!_.has(user, "traits_customerio/created_at")) {
        this.client.asUser(user).logger.info("outgoing.deletion.skip", { reason: "User was never sent to customer.io" });
        return false;
      }

      return true;
    }).map(user => this.deleteUser(user)));
  }

  getUsersCustomerioId(user: Object) {
    return _.get(user, this.idMapping);
  }

  getIdMapping() {
    return this.idMapping;
  }

  sendAllUserProperties(user: Object, segments: Array<Object>): Promise<*> {
    const email = _.get(user, "email");
    if (!email) {
      this.client.asUser(user).logger.info("outgoing.user.skip", { id: user[this.idMapping], reason: "Missing email" });
      return Promise.resolve();
    }

    const userCustomerioId = this.getUsersCustomerioId(user);

    if (!userCustomerioId) {
      this.client.asUser(user).logger.info("outgoing.user.skip", { id: user[this.idMapping], reason: "Missing id" });
      return Promise.resolve();
    }

    const created_at = moment();
    const userIdent = { email };

    const mapper = new AttributesMapper(this.userAttributesMapping);
    const payloadUser = _.merge({ email, hull_segments: segments.map(s => s.name) }, user);

    const filteredHullUserTraits = mapper.mapAttributesForService(payloadUser, created_at, email);

    return Promise.all(
      _.chunk(_.toPairs(filteredHullUserTraits), 30)
        .map(_.fromPairs)
        .map(userData => {
          this.client.logger.debug("outgoing.user.progress", { userPropertiesSent: Object.keys(userData).length });
          return this.customerioClient.identify(userCustomerioId, userData);
        }
    ))
      .then(() => {
        if (_.has(user, "traits_customerio/deleted_at")) {
          return this.client.asUser(userIdent).traits({ "customerio/deleted_at": null, "customerio/created_at": created_at });
        } else if (_.has(filteredHullUserTraits, "created_at")) {
          return this.client.asUser(userIdent).traits({ "customerio/created_at": created_at });
        }

        return {};
      })
      .then(() => {
        this.metric.increment("ship.outgoing.users", 1);
        return this.client.asUser(userIdent).logger.info("outgoing.user.success", { traits: filteredHullUserTraits });
      })
      .catch(err => this.client.asUser(userIdent).logger.error("outgoing.user.error", { traits: filteredHullUserTraits, errors: err.message }));
  }

  deleteUser(user: Object): Promise<*> {
    const id = this.getUsersCustomerioId(user);

    if (!id) {
      this.client.logger.debug("user.deletion.skip", { user, reason: "Missing id" });
      return Promise.resolve();
    }

    return this.customerioClient.deleteUser(id)
      .then(() => {
        if (_.has(user, "traits_customerio/created_at")) {
          return this.client.asUser(user).traits({ "customerio/deleted_at": moment().format(), "customerio/created_at": null });
        }
        return {};
      })
      .then(() => this.client.asUser(user).logger.info("user.deletion.success"))
      .catch(err => this.client.asUser(user).logger.error("user.deletion.error", { errors: err.message }));
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.customerioClient.sendAnonymousEvent(eventName, eventData)
      .then(() => {
        this.client.logger.info("outgoing.event.success", { eventName, eventData });
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch(err => this.client.logger.error("outgoing.event.error", { eventName, eventData, errors: err.message }));
  }

  sendPageEvent(userIdent: Object, page: string, event: Object): Promise<*> {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.customerioClient.sendPageViewEvent(id, page, event)
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.event.success");
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch(err => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err.message }));
  }

  sendUserEvent(userIdent: Object, eventName: string, eventData: Object): Promise<*> {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.customerioClient.sendCustomerEvent(id, eventName, eventData)
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.event.success");
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch(err => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err.message }));
  }
}
