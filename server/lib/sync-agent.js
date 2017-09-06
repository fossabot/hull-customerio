/* @flow */
import _ from "lodash";
import moment from "moment";
import CustomerioClient from "./customerio-client";

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

  sendBatchOfUsers(messages: Array<Object>) {
    return Promise.all(messages.map(message => this.sendAllUserProperties(message.user, message.segments)));
  }

  filterDeletion(user: Object) {
    if (_.get(user, "traits_customerio/deleted_at")) {
      this.client.asUser(user).logger.debug("user.deletion.skip", { reason: "user already deleted" });
      return false;
    }

    if (!_.get(user, "traits_customerio/id")) {
      this.client.asUser(user).logger.debug("user.deletion.skip", { reason: "user was never sent to customer.io" });
      return false;
    }

    return true;
  }

  deleteBatchOfUsers(users: Array<Object>) {
    return Promise.all(users.filter(this.filterDeletion.bind(this)).map(user => this.deleteUser(user)));
  }

  getUsersCustomerioId(user: Object) {
    return _.get(user, "traits_customerio/id", _.get(user, this.idMapping));
  }

  getIdMapping() {
    return this.idMapping;
  }

  sendAllUserProperties(user: Object, segments: Array<Object>) {
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

    if (!alreadySetCustomerId || _.has(user, "traits_customerio/deleted_at")) {
      filteredHullUserTraits = _.merge({ created_at }, filteredHullUserTraits);
    }
    filteredHullUserTraits = _.merge({ email, hull_segments: segments.map(s => s.name).join(", ") }, filteredHullUserTraits);
    const hullUserTraits = _.mapKeys(
      _.merge({ id: userCustomerioId }, _.omit(filteredHullUserTraits, "hull_segments")),
      ((value, key) => `customerio/${key}`)
    );

    return Promise.all(
      (_.chunk(_.toPairs(filteredHullUserTraits), 30))
        .map(_.fromPairs)
        .map(userData => {
          this.client.logger.debug("outgoing.user.progress", { userPropertiesSent: Object.keys(userData).length });
          return this.customerioClient.identify(userCustomerioId, userData);
        }
    ))
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.user.success");
        this.metric.increment("ship.outgoing.users", 1);
        if (_.has(user, "traits_customerio/deleted_at")) {
          return this.client.asUser(userIdent).traits(
            _.merge({ "customerio/deleted_at": null }, hullUserTraits)
          );
        }
        return this.client.asUser(userIdent).traits(
          hullUserTraits
        );
      })
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.user.error", { errors: err.message }));
  }

  deleteUser(user: Object) {
    const id = this.getUsersCustomerioId(user);

    if (!id) {
      this.client.logger.debug("user.deletion.skip", { user, reason: "Missing id" });
      return Promise.resolve();
    }

    return this.customerioClient.deleteUser(id)
      .then(() => {
        this.client.asUser(user).logger.debug("user.deletion.success");
        return this.client.asUser(user).traits({ "customerio/deleted_at": moment().format() });
      })
      .catch((err) => this.client.asUser(user).logger.debug("user.deletion.error", { errors: err.message }));
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.customerioClient.sendAnonymousEvent(eventName, eventData)
      .then(() => {
        this.client.logger.info("outgoing.event.success", { eventName, eventData });
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch((err) => this.client.logger.error("outgoing.event.error", { eventName, eventData, errors: err.message }));
  }

  sendPageEvent(userIdent: Object, page: string, event: Object) {
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
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err.message }));
  }

  sendUserEvent(userIdent: Object, eventName: string, eventData: Object) {
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
      .catch((err) => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err.message }));
  }
}
