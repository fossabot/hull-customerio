/* @flow */
import type { THullReqContext, THullUserUpdateMessage } from "hull";
import type { IMetricsClient, IServiceClientOptions, TUserUpdateEnvelope, IFilterUtilOptions, IMappingUtilOptions, IServiceCredentials, IOperationsUtilOptions } from "./types";

const _ = require("lodash");
const moment = require("moment");
const Promise = require("bluebird");
const { TransientError } = require("hull/lib/errors");

const AttributesMapper = require("./attributes-mapper");
const FilterUtil = require("./sync-agent/filter-util");
const ServiceClient = require("./service-client");
const MappingUtil = require("./sync-agent/mapping-util");
const OperationsUtil = require("./sync-agent/operations-util");
const HashUtil = require("./sync-agent/hash-util");
const SHARED_MESSAGES = require("./shared-messages");

const BASE_API_URL = "https://track.customer.io";
const SEGMENT_PROPERTY_NAME = "segments"; // Prep for transition to dedicated segments for accounts and users


class SyncAgent {
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
  client: Object;

  /**
   * Gets or sets the filter utility.
   * 
   * @type {FilterUtil}
   * @memberof SyncAgent
   */
  filterUtil: FilterUtil;

  /**
   * Gets or sets the client to communicate with 
   * the customer.io API.
   * 
   * @type {ServiceClient}
   * @memberof SyncAgent
   */
  serviceClient: ServiceClient;

  /**
   * Gets or sets the mapping utility.
   * 
   * @type {MappingUtil}
   * @memberof SyncAgent
   */
  mappingUtil: MappingUtil;

  /**
   * Gets or sets the service credentials.
   * 
   * @type {IServiceCredentials}
   * @memberof SyncAgent
   */
  serviceCredentials: IServiceCredentials;

  /**
   * Gets or sets the operations utility.
   * 
   * @type {OperationsUtil}
   * @memberof SyncAgent
   */
  operationsUtil: OperationsUtil;

  /**
   * Gets or sets the hash utility.
   * 
   * @type {HashUtil}
   * @memberof SyncAgent
   */
  hashUtil: HashUtil;

  /**
   * Creates an instance of SyncAgent.
   * @param {THullReqContext} reqContext The Hull request context. 
   * @memberof SyncAgent
   */
  constructor(reqContext: THullReqContext) {
    // Init service client
    const clntOptions: IServiceClientOptions = {
      metricsClient: _.get(reqContext, "metric"),
      logger: _.get(reqContext, "client.logger"),
      credentials: {
        username: _.get(reqContext, "connector.private_settings.site_id", null),
        password: _.get(reqContext, "connector.private_settings.api_key", null)
      },
      baseApiUrl: BASE_API_URL
    };

    this.serviceCredentials = clntOptions.credentials;
    this.serviceClient = new ServiceClient(clntOptions);

    // Init metrics and hull client
    this.metric = _.get(reqContext, "metric");
    this.client = _.get(reqContext, "client");

    // Init filter util
    const filterUtilOptions: IFilterUtilOptions = {
      synchronizedSegments: _.get(reqContext, "connector.private_settings.synchronized_segments", []),
      segmentPropertyName: SEGMENT_PROPERTY_NAME,
      ignoreUsersWithoutEmail: true,
      deletionEnabled: _.get(reqContext, "connector.private_settings.enable_user_deletion", false),
      synchronizedEvents: _.get(reqContext, "connector.private_settings.events_filter", []),
      userAttributeServiceId: _.get(reqContext, "connector.private_settings.user_id_mapping", "external_id")
    };

    this.filterUtil = new FilterUtil(filterUtilOptions);

    // Init mapping util
    const mappingUtilOptions: IMappingUtilOptions = {
      userAttributeServiceId: _.get(reqContext, "connector.private_settings.user_id_mapping", "external_id"),
      userAttributeMappings: _.get(reqContext, "connector.private_settings.synchronized_attributes", [])
    };

    this.mappingUtil = new MappingUtil(mappingUtilOptions);

    // Init the operations util
    const operationsUtilOptions: IOperationsUtilOptions = {
      segmentPropertyName: SEGMENT_PROPERTY_NAME
    };
    this.operationsUtil = new OperationsUtil(operationsUtilOptions);
    this.operationsUtil.filterUtil = this.filterUtil;
    this.operationsUtil.mappingUtil = this.mappingUtil;

    // Init the hash util
    this.hashUtil = new HashUtil();
  }

  /**
   * Checks whether the connector is configured with
   * credentials or not.
   * 
   * @returns {boolean} True if site id and password are set; otherwise false.
   * @memberof SyncAgent
   */
  isConfigured(): boolean {
    return !_.isNil(this.serviceCredentials.username) &&
           !_.isNil(this.serviceCredentials.password);
  }

  /**
   * Performs a call against the API to check whether
   * the credentials are valid or not.
   * 
   * @returns {Promise<boolean>} True if credentials are valid; otherwise false.
   * @memberof SyncAgent
   */
  checkAuth(): Promise<boolean> {
    return this.serviceClient.checkValidCredentials();
  }

  /**
   * Processes all user:update notifications.
   *
   * @param {Array<THullUserUpdateMessage>} messages The list of notification messages.
   * @param {boolean} [isBatch=false] True if batch operation; otherwise False. Default is False.
   * @returns {Promise<any>} A promise which contains all operation results.
   * @memberof SyncAgent
   */
  async sendUserMessages(messages: Array<THullUserUpdateMessage>, isBatch: boolean = false): Promise<any> {
    if (this.isConfigured() === false) {
      // We don't need a log line here, it's already in the status that the connector is not configured.
      return Promise.resolve();
    }

    if (messages.length === 0) {
      return Promise.resolve();
    }

    try {
      const areCredentialsValid = await this.serviceClient.checkAuth();
      if (!areCredentialsValid) {
        return Promise.resolve();
      }
    } catch (error) {
      // We don't need a log line here, it's already in the status that the connector is not authenticated.
      return Promise.resolve();
    }

    // Filter all messages
    const dedupedEnvelopes: Array<TUserUpdateEnvelope> = this.filterUtil.deduplicateMessages(messages);
    const filteredEnvelopes: TFilterResults<TUserUpdateEnvelope> = this.filterUtil.filterUsersBySegment(dedupedEnvelopes);

    // Prepare the message to operate upon
    const opsEnvelopes: TFilterResults<TUserUpdateEnvelope> = this.operationsUtil.composeCombinedUserAccountObject(filteredEnvelopes);
    opsEnvelopes.toInsert = _.map(opsEnvelopes.toInsert, (envelope: TUserUpdateEnvelope) => {
      return this.operationsUtil.composeServiceObjects(envelope);
    });
    opsEnvelopes.toUpdate = _.map(opsEnvelopes.toUpdate, (envelope: TUserUpdateEnvelope) => {
      return this.operationsUtil.composeServiceObjects(envelope);
    });
    opsEnvelopes.toDelete = _.map(opsEnvelopes.toDelete, (envelope: TUserUpdateEnvelope) => {
      return this.operationsUtil.composeServiceObjects(envelope);
    });

    // Verify that actually something changed on the customer object by comparing it with the hash
    // otherwise skip the API calls
    const envelopesToUpdate = [];
    _.forEach(opsEnvelopes.toUpdate, (envelope) => {
      const customerHash = _.get(envelope, "hullUser.traits_customerio/hash", "");
      if (customerHash === "" || (customerHash !== this.hashUtil.hash(envelope.customer))) {
        return envelopesToUpdate.push(envelope);
      }
      _.set(envelope, "skipReason", SHARED_MESSAGES.SKIP_NOCHANGES);
      opsEnvelopes.toSkip.push(envelope);
    });
    opsEnvelopes.toUpdate = envelopesToUpdate;

    // Process all users that should be skipped
    filteredEnvelopes.toSkip.forEach((envelope: TUserUpdateEnvelope) => {
      this.client.asUser(envelope.message.user).logger.info("outgoing.user.skip", { reason: envelope.skipReason });
    });
    // Process all users that should be inserted
    filteredEnvelopes.toInsert.forEach((envelope: TUserUpdateEnvelope) => {
      try {
        this.metric.increment("ship.outgoing.user", 1);
        await this.serviceClient.updateCustomer(envelope.customer);
        const userTraits = this.mappingUtil.mapToHullTraits(envelope.customer, new Date());
        const userScopedClient = this.client.asUser(envelope.message.user);
        userScopedClient.traits(userTraits, { source: "customerio" }).then(() => {
          userScopedClient.logger.info("outgoing.user.success", { data: envelope.customer, operation: "updateCustomer" });
        });
        // Process the events
        if (_.get(envelope, "customerEventsToSkip", []).length > 0) {
          const eventSkipLogData = _.map(_.get(envelope, "customerEventsToSkip"), e => e.name);
          userScopedClient.logger.info("outgoing.event.skip", { reason: SKIP_NOTWHITELISTEDEVENTS, events: eventSkipLogData });
        }

        if (_.get(envelope, "customerEvents", []).length > 0) {
          if (_.get(envelope, "customer.id", null) === null) {
            // No ID, send as anonymous events
            _.forEach(_.get(envelope, "customerEvents", []), (event) => {
              this.metric.increment("ship.outoing.event", 1);
              await this.serviceClient.sendAnonymousEvent(event);
            });
            const eventsAnonLogData = _.map(_.get(envelope, "customerEvents"), e => e.name);
            userScopedClient.logger.info("outgoing.event.success", { events: eventsAnonLogData, operation: "sendAnonymousEvent" });
          } else {
            _.forEach(_.get(envelope, "customerEvents", []), (event) => {
              this.metric.increment("ship.outoing.event", 1);
              await this.serviceClient.sendEvent(envelope.customer.id, event);
            });
            const eventsCustomerLogData = _.map(_.get(envelope, "customerEvents"), e => e.name);
            userScopedClient.logger.info("outgoing.event.success", { events: eventsCustomerLogData, operation: "sendEvent" });
          }
        }
      } catch(err) {
        throw new TransientError("Failed to update a user or one of its events, see innerException for more details.", { innerException: err });
      }
    });
    // Process all users that should be updated
    filteredEnvelopes.toUpdate.forEach((envelope: TUserUpdateEnvelope) => {
      try {
        this.metric.increment("ship.outgoing.user", 1);
        await this.serviceClient.updateCustomer(envelope.customer);
        const userTraits = this.mappingUtil.mapToHullTraits(envelope.customer, new Date());
        const userScopedClient = this.client.asUser(envelope.message.user);
        userScopedClient.traits(userTraits, { source: "customerio" }).then(() => {
          userScopedClient.logger.info("outgoing.user.success", { data: envelope.customer, operation: "updateCustomer" });
        });
        // Process the events
        if (_.get(envelope, "customerEventsToSkip", []).length > 0) {
          const eventSkipLogData = _.map(_.get(envelope, "customerEventsToSkip"), e => e.name);
          userScopedClient.logger.info("outgoing.event.skip", { reason: SKIP_NOTWHITELISTEDEVENTS, events: eventSkipLogData });
        }

        if (_.get(envelope, "customerEvents", []).length > 0) {
          if (_.get(envelope, "customer.id", null) === null) {
            // No ID, send as anonymous events
            _.forEach(_.get(envelope, "customerEvents", []), (event) => {
              this.metric.increment("ship.outoing.event", 1);
              await this.serviceClient.sendAnonymousEvent(event);
            });
            const eventsAnonLogData = _.map(_.get(envelope, "customerEvents"), e => e.name);
            userScopedClient.logger.info("outgoing.event.success", { events: eventsAnonLogData, operation: "sendAnonymousEvent" });
          } else {
            _.forEach(_.get(envelope, "customerEvents", []), (event) => {
              this.metric.increment("ship.outoing.event", 1);
              await this.serviceClient.sendEvent(envelope.customer.id, event);
            });
            const eventsCustomerLogData = _.map(_.get(envelope, "customerEvents"), e => e.name);
            userScopedClient.logger.info("outgoing.event.success", { events: eventsCustomerLogData, operation: "sendEvent" });
          }
        }
      } catch(err) {
        throw new TransientError("Failed to update a user or one of its events, see innerException for more details.", { innerException: err });
      }
    });
    // Process all users that should be deleted
    filteredEnvelopes.toDelete.forEach((envelope: TUserUpdateEnvelope) => {
      try {
        this.metric.increment("ship.outgoing.user", 1);
        await this.serviceClient.deleteCustomer(_.get(envelope, "customer.id"));

        const userScopedClient = this.client.asUser(envelope.message.user);
        userScopedClient.traits({ deleted_at: new Date(), id: null, hash: null, synced_at: null}, { source: "customerio" }).then(() => {
          userScopedClient.logger.info("outgoing.user.success", { data: envelope.customer, operation: "deleteCustomer" });
        });

      } catch(err) {
        throw new TransientError("Failed to delete a user, see innerException for more details.", { innerException: err });
      }
    });
  }

  /**
   * Handles the payload of a webhook.
   *
   * @param {Object} payload The webhook payload.
   * @returns {Promise<any>} A promise which returns the result of the Hull logger call.
   * @memberof SyncAgent
   */
  handleWebhook(payload: Object): Promise<any> {
    const userIdent = this.mappingUtil.mapWebhookToUserIdent(payload);
    const event = this.mappingUtil.mapWebhookToHullEvent(payload);

    this.metric.increment("hip.incoming.events", 1);
    if (event === null ) {
      this.client.logger.info("incoming.event.error", { reason: SHARED_MESSAGES.ERROR_INVALIDEVENT , data: payload });
      return Promise.resolve();
    }

    if (_.keys(userIdent).length === 0) {
      this.client.logger.info("incoming.event.error", { reason: SHARED_MESSAGES.ERROR_NOUSERIDENT , data: payload });
      return Promise.resolve();
    }

    const userScopedClient = this.client.asUser(userIdent);

    return asUser.track(event.event, event.properties, event.context).then(() => {
      return asUser.logger.info("incoming.event.success", { event });
    }).catch((err) => {
      return asUser.logger.error("incoming.event.error", { reason: SHARED_MESSAGES.ERROR_TRACKFAILED, message: err.message innerException: err });
    });
  }
}

module.exports = SyncAgent;
