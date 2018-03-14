/* @flow */

import type { IMetricsClient } from "./types";

const _ = require("lodash");
const moment = require("moment");
const Promise = require("bluebird");
const CustomerioClient = require("./customerio-client");
const AttributesMapper = require("./attributes-mapper");

class SyncAgent {
  /**
   * Gets or sets the customer.io client to interact with the API.
   *
   * @type {CustomerioClient}
   * @memberof SyncAgent
   */
  customerioClient: CustomerioClient;

  /**
   * Gets or sets the client to log metrics.
   *
   * @type {IMetricsClient}
   * @memberof SyncAgent
   */
  metric: IMetricsClient;

  /**
   * Gets or set the hull-node client.
   *
   * @type {*}
   * @memberof SyncAgent
   */
  client: any;

  /**
   * Gets or sets the trait which is used as unique identifier in customer.io.
   *
   * @type {string}
   * @memberof SyncAgent
   */
  idMapping: string;

  /**
   * Gets or sets the user attribute mappings.
   *
   * @type {Array<string>}
   * @memberof SyncAgent
   */
  userAttributesMapping: Array<string>;

  constructor(client: any, connector: any, metric: IMetricsClient) {
    this.customerioClient = new CustomerioClient(client, connector, metric);
    this.metric = metric;
    this.client = client;

    this.idMapping = _.get(connector, "private_settings.user_id_mapping", "external_id");
    this.userAttributesMapping = _.get(connector, "private_settings.synchronized_attributes", []);
  }

  isConfigured(): boolean {
    return this.customerioClient.isConfigured();
  }

  checkAuth(): any {
    return this.customerioClient.checkAuth();
  }

  sendBatchOfUsers(messages: Array<Object>): Promise<any> {
    return Promise.all(messages.map(message => this.sendAllUserProperties(message.user, message.segments)));
  }

  deleteBatchOfUsers(users: Array<Object>): Promise<any> {
    return Promise.all(users.filter(user => {
      if (_.has(user, "traits_customerio/deleted_at")) {
        this.client.asUser(user).logger.info("outgoing.deletion.skip", { reason: "User has been already deleted from customer.io." });
        return false;
      }

      if (!_.has(user, "traits_customerio/created_at")) {
        this.client.asUser(user).logger.info("outgoing.deletion.skip", { reason: "User has never been created in customer.io." });
        return false;
      }

      return true;
    }).map(user => this.deleteUser(user)));
  }

  /**
   * Returns the trait which is used as the unique identifier in customer.io.
   *
   * @param {Object} user The hull user.
   * @returns {*} The unique identifier for customer.io.
   * @memberof SyncAgent
   */
  getUsersCustomerioId(user: Object): any {
    return _.get(user, this.idMapping);
  }

  /**
   * Returns the name of the trait which is used as the unique identifier in customer.io.
   *
   * @returns {string} The attribute name.
   * @memberof SyncAgent
   */
  getIdMapping(): string {
    return this.idMapping;
  }

  sendAllUserProperties(user: Object, segments: Array<Object>): Promise<any> {
    const email = _.get(user, "email");
    const serviceId = this.getUsersCustomerioId(user);

    if (!email) {
      this.client.asUser(user).logger.info("outgoing.user.skip", { id: serviceId, reason: "User doesn't have an email." });
      return Promise.resolve();
    }

    const userCustomerioId = this.getUsersCustomerioId(user);

    if (!userCustomerioId) {
      this.client.asUser(user).logger.info("outgoing.user.skip", {
        id: serviceId,
        reason: `User doesn't have a value for trait '${this.idMapping}' which is used as unique identifier for customer.io.`
      });
      return Promise.resolve();
    }

    const created_at = moment().format("X");
    const userIdent = { email };

    const mapper = new AttributesMapper(this.userAttributesMapping);
    const payloadUser = _.merge({ email, hull_segments: segments.map(s => s.name) }, user);

    const filteredHullUserTraits = mapper.mapAttributesForService(payloadUser, created_at, email);
    const asUser = this.client.asUser(userIdent);

    return Promise.all(_.chunk(_.toPairs(filteredHullUserTraits), 30)
      .map(_.fromPairs)
      .map(userData => {
        this.client.logger.debug("outgoing.user.progress", { userPropertiesSent: Object.keys(userData).length });
        return this.customerioClient.identify(userCustomerioId, userData);
      })).then(() => {
      if (_.has(user, "traits_customerio/deleted_at")) {
        asUser(userIdent).traits({ "customerio/deleted_at": null, "customerio/created_at": created_at });
        this.metric.increment("ship.outgoing.users", 1);
        return asUser(userIdent).logger.info("outgoing.user.success", { traits: filteredHullUserTraits });
      } else if (_.has(filteredHullUserTraits, "created_at")) {
        asUser(userIdent).traits({ "customerio/created_at": created_at });
        this.metric.increment("ship.outgoing.users", 1);
        return asUser(userIdent).logger.info("outgoing.user.success", { traits: filteredHullUserTraits });
      }

      return {};
    }).catch(err => {
      asUser(userIdent).logger.error("outgoing.user.error", { traits: filteredHullUserTraits, errors: err.message });
    });
  }

  deleteUser(user: Object): Promise<any> {
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

  sendAnonymousEvent(eventName: string, eventData: Object): Promise<any> {
    return this.customerioClient.sendAnonymousEvent(eventName, eventData)
      .then(() => {
        this.client.logger.info("outgoing.event.success", { eventName, eventData });
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch(err => this.client.logger.error("outgoing.event.error", { eventName, eventData, errors: err.message }));
  }

  sendPageEvent(userIdent: Object, page: string, eventData: Object): Promise<any> {
    const id = this.getUsersCustomerioId(userIdent);

    if (!id) {
      this.client.logger.info("outgoing.event.skip", { reason: "Missing customerio id" });
      return Promise.resolve();
    }

    return this.customerioClient.sendPageViewEvent(id, page, eventData)
      .then(() => {
        this.client.asUser(userIdent).logger.info("outgoing.event.success");
        return this.metric.increment("ship.outgoing.events", 1);
      })
      .catch(err => this.client.asUser(userIdent).logger.error("outgoing.event.error", { errors: err.message }));
  }

  sendUserEvent(userIdent: Object, eventName: string, eventData: Object): Promise<any> {
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

module.exports = SyncAgent;
