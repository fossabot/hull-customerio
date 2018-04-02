/* @flow */
import type { THullReqContext, THullUserUpdateMessage } from "hull";
import type { IMetricsClient, IServiceClientOptions, TUserUpdateEnvelope, IFilterUtilOptions, IMappingUtilOptions, IServiceCredentials, TFilterResults, ICustomerIoEvent, IValidationUtilOptions } from "./types";

const _ = require("lodash");
const Promise = require("bluebird");

const FilterUtil = require("./sync-agent/filter-util");
const ServiceClient = require("./service-client");
const MappingUtil = require("./sync-agent/mapping-util");
const HashUtil = require("./sync-agent/hash-util");
const ValidationUtil = require("./sync-agent/validation-util");
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
   * Gets or sets the hash utility.
   *
   * @type {HashUtil}
   * @memberof SyncAgent
   */
  hashUtil: HashUtil;

  /**
   * Gets or sets the property name used for user segments.
   *
   * @type {string}
   * @memberof SyncAgent
   */
  segmentPropertyName: string;

  /**
   * Gets or sets the validation utility.
   *
   * @type {ValidationUtil}
   * @memberof SyncAgent
   */
  validationUtil: ValidationUtil;

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
        username: _.get(reqContext, "ship.private_settings.site_id", null),
        password: _.get(reqContext, "ship.private_settings.api_key", null)
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
      synchronizedSegments: _.get(reqContext, "ship.private_settings.synchronized_segments", []),
      segmentPropertyName: SEGMENT_PROPERTY_NAME,
      ignoreUsersWithoutEmail: true,
      deletionEnabled: _.get(reqContext, "ship.private_settings.enable_user_deletion", false),
      synchronizedEvents: _.get(reqContext, "ship.private_settings.events_filter", []),
      userAttributeServiceId: _.get(reqContext, "ship.private_settings.user_id_mapping", "external_id")
    };

    this.filterUtil = new FilterUtil(filterUtilOptions);

    // Init mapping util
    const mappingUtilOptions: IMappingUtilOptions = {
      userAttributeServiceId: _.get(reqContext, "ship.private_settings.user_id_mapping", "external_id"),
      userAttributeMappings: _.get(reqContext, "ship.private_settings.synchronized_attributes", [])
    };

    this.mappingUtil = new MappingUtil(mappingUtilOptions);

    this.segmentPropertyName = SEGMENT_PROPERTY_NAME;

    // Init the hash util
    this.hashUtil = new HashUtil();

    // Init the validation util
    const valUtilOptions: IValidationUtilOptions = {
      maxAttributeNameLength: 150,
      maxAttributeValueLength: 1000,
      maxIdentifierValueLength: 150
    };

    this.validationUtil = new ValidationUtil(valUtilOptions);
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

  createUserUpdateEnvelopes(messages: Array<THullUserUpdateMessage>): Array<TUserUpdateEnvelope> {
    return _.map(messages, (message): TUserUpdateEnvelope => {
      const hullUser = _.cloneDeep(_.get(message, "user", {}));
      _.set(hullUser, "account", _.get(message, "account", {}));

      const allEvents = _.map(_.get(message, "events", []), (event) => this.mappingUtil.mapToServiceEvent(event));
      const filteredEvents: TFilterResults<ICustomerIoEvent> = this.filterUtil.filterEvents(allEvents);
      const customer = this.mappingUtil.mapToServiceUser(hullUser, _.get(message, this.segmentPropertyName, []));

      const envelope: TUserUpdateEnvelope = {
        message,
        hullUser,
        customer,
        hash: this.hashUtil.hash(customer),
        customerEvents: filteredEvents.toInsert,
        customerEventsToSkip: filteredEvents.toSkip
      };
      return envelope;
    });
  }

  /**
   * Processes all user:update notifications.
   *
   * @param {Array<THullUserUpdateMessage>} messages The list of notification messages.
   * @param {boolean} [isBatch=false] True if batch operation; otherwise False. Default is False.
   * @returns {Promise<any>} A promise which contains all operation results.
   * @memberof SyncAgent
   */
  async sendUserMessages(messages: Array<THullUserUpdateMessage>): Promise<*> {
    if (this.isConfigured() === false) {
      // We don't need a log line here, it's already in the status that the connector is not configured.
      return Promise.resolve();
    }

    if (messages.length === 0) {
      return Promise.resolve();
    }

    // deduplicate all messages - merge events but take only last message from notification
    const dedupedMessages: Array<THullUserUpdateMessage> = this.filterUtil.deduplicateMessages(messages);

    // create envelopes with all necessary data
    const userUpdateEnvelopes: Array<TUserUpdateEnvelope> = this.createUserUpdateEnvelopes(dedupedMessages);

    // filter those envelopes to get `toSkip`, `toInsert`, `toUpdate` and `toDelete`
    const filteredEnvelopes: TFilterResults<TUserUpdateEnvelope> = this.filterUtil.filterUsersBySegment(userUpdateEnvelopes);

    this.client.logger.debug("sendUserMessages", {
      toSkip: filteredEnvelopes.toSkip.length,
      toUpdate: filteredEnvelopes.toUpdate.length,
      toInsert: filteredEnvelopes.toInsert.length,
      toDelete: filteredEnvelopes.toDelete.length
    });

    // Process all users that should be skipped
    filteredEnvelopes.toSkip.forEach((envelope: TUserUpdateEnvelope) => {
      this.client.asUser(envelope.message.user).logger.info("outgoing.user.skip", { reason: envelope.skipReason });
    });

    // Process all users that should be inserted
    await Promise.all(filteredEnvelopes.toInsert.map((envelope: TUserUpdateEnvelope) => this.updateUserEnvelope(envelope)));

    // Process all users that should be updated
    await Promise.all(filteredEnvelopes.toUpdate.map((envelope: TUserUpdateEnvelope) => this.updateUserEnvelope(envelope)));

    // Process all users that should be deleted
    await Promise.all(filteredEnvelopes.toDelete.map((envelope: TUserUpdateEnvelope) => this.deleteUserEnvelope(envelope)));

    return true;
  }

  updateUserEnvelope(envelope: TUserUpdateEnvelope): Promise<*> {
    const userScopedClient = this.client.asUser(envelope.message.user);
    const validationResult = this.validationUtil.validateCustomer(envelope.customer);

    if (validationResult.isValid === false) {
      return userScopedClient.logger.info("outgoing.user.error", { data: envelope.customer, operation: "updateCustomer", validationErrors: validationResult.validationErrors });
    }

    this.metric.increment("ship.outgoing.users", 1);
    const userTraits = this.mappingUtil.mapToHullTraits(envelope.customer, new Date());
    return this.serviceClient.updateCustomer(envelope.customer)
      .then(() => {
        return userScopedClient.traits(userTraits, { source: "customerio" }).then(() => {
          userScopedClient.logger.info("outgoing.user.success", { data: envelope.customer, operation: "updateCustomer" });
        });
      })
      .then(() => {
        // Process the events
        if (_.get(envelope, "customerEventsToSkip", []).length > 0) {
          const eventSkipLogData = _.map(_.get(envelope, "customerEventsToSkip"), e => e.name);
          userScopedClient.logger.info("outgoing.event.skip", { reason: SHARED_MESSAGES.SKIP_NOTWHITELISTEDEVENTS, events: eventSkipLogData });
        }

        if (_.get(envelope, "customerEvents", []).length === 0) {
          return Promise.resolve();
        }

        if (!envelope.customer || !envelope.customer.id) {
          // No ID, send as anonymous events
          return Promise.all(_.get(envelope, "customerEvents", []).map((event) => {
            this.metric.increment("ship.outoing.events", 1);
            return this.serviceClient.sendAnonymousEvent(event);
          }))
            .then(() => {
              const eventsAnonLogData = _.map(_.get(envelope, "customerEvents"), e => e.name);
              return userScopedClient.logger.info("outgoing.event.success", { events: eventsAnonLogData, operation: "sendAnonymousEvent" });
            });
        }
        return Promise.all(_.get(envelope, "customerEvents", []).map((event) => {
          this.metric.increment("ship.outoing.events", 1);
          return this.serviceClient.sendEvent(envelope.customer.id, event);
        }))
          .then(() => {
            const eventsCustomerLogData = _.map(_.get(envelope, "customerEvents"), e => e.name);
            userScopedClient.logger.info("outgoing.event.success", { events: eventsCustomerLogData, operation: "sendEvent" });
          });
      });
  }

  deleteUserEnvelope(envelope: TUserUpdateEnvelope): Promise<*> {
    this.metric.increment("ship.outgoing.users", 1);
    const userScopedClient = this.client.asUser(envelope.message.user);
    return this.serviceClient.deleteCustomer(_.get(envelope, "customer.id"))
      .then(() => {
        return userScopedClient.traits({
          deleted_at: new Date(), id: null, hash: null, synced_at: null, created_at: null
        }, { source: "customerio" }).then(() => {
          return userScopedClient.logger.info("outgoing.user.success", { data: envelope.customer, operation: "deleteCustomer" });
        });
      });
  }

  /**
   * Handles the payload of a webhook.
   *
   * @param {Object} payload The webhook payload.
   * @returns {Promise<any>} A promise which returns the result of the Hull logger call.
   * @memberof SyncAgent
   */
  handleWebhook(payload: Object): Promise<*> {
    const userIdent = this.mappingUtil.mapWebhookToUserIdent(payload);
    const event = this.mappingUtil.mapWebhookToHullEvent(payload);

    this.metric.increment("ship.incoming.events", 1);
    if (event === null) {
      this.client.logger.info("incoming.event.error", { reason: SHARED_MESSAGES.ERROR_INVALIDEVENT, data: payload });
      return Promise.resolve();
    }

    if (_.size(userIdent) === 0) {
      this.client.logger.info("incoming.event.error", { reason: SHARED_MESSAGES.ERROR_NOUSERIDENT, data: payload });
      return Promise.resolve();
    }

    const userScopedClient = this.client.asUser(userIdent);

    return userScopedClient.track(event.event, event.properties, event.context).then(() => {
      return userScopedClient.logger.info("incoming.event.success", { event });
    }).catch((err) => {
      return userScopedClient.logger.error("incoming.event.error", { reason: SHARED_MESSAGES.ERROR_TRACKFAILED, message: err.message, innerException: err });
    });
  }
}

module.exports = SyncAgent;
