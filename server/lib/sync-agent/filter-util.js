/* @flow */
import type { THullUserUpdateMessage } from "hull";
import type { TFilterResults, TUserUpdateEnvelope, ICustomerIoEvent, IFilterUtilOptions } from "../types";

const _ = require("lodash");
const SHARED_MESSAGES = require("../shared-messages");

class FilterUtil {
  /**
   * Gets or sets the list of synchronized segments.
   *
   * @type {Array<string>}
   * @memberof FilterUtil
   */
  synchronizedSegments: Array<string>;
  /**
   * Gets or sets the property name of messages for the user segmetns.
   *
   * @type {string}
   * @memberof FilterUtil
   */
  segmentPropertyName: string;
  /**
   * Gets or sets a value to control whether users without email
   * will be synced or not.
   *
   * @type {boolean}
   * @memberof FilterUtil
   */
  ignoreUsersWithoutEmail: boolean;

  /**
   * Gets or sets a value to control whether user deletion is enabled.
   *
   * @type {boolean}
   * @memberof FilterUtil
   */
  deletionEnabled: boolean;

  /**
   * Gets or sets the synchronized events.
   *
   * @type {Array<string>}
   * @memberof FilterUtil
   */
  synchronizedEvents: Array<string>;

  /**
   * Gets or set the attribute name which is used as id in customer.io.
   *
   * @type {string}
   * @memberof FilterUtil
   */
  userAttributeServiceId: string;

  /**
   * Creates an instance of FilterUtil.
   * @param {IFilterUtilOptions} options The options to configure the filter utility.
   * @memberof FilterUtil
   */
  constructor(options: IFilterUtilOptions) {
    this.synchronizedSegments = _.get(options, "synchronizedSegments", []);
    this.segmentPropertyName = _.get(options, "segmentPropertyName", "segments");
    this.ignoreUsersWithoutEmail = _.get(options, "ignoreUsersWithoutEmail", false);
    this.deletionEnabled = _.get(options, "deletionEnabled", false);
    this.synchronizedEvents = _.get(options, "synchronizedEvents", []);
    this.userAttributeServiceId = _.get(options, "userAttributeServiceId", "external_id");
  }

  /**
   * Filters the envelopes.
   *
   * @param {Array<TUserUpdateEnvelope>} envelopes The list of envelopes.
   * @returns {TFilterResults<TUserUpdateEnvelope>} The result of the filer operation.
   * @memberof FilterUtil
   */
  filterUsersBySegment(envelopes: Array<TUserUpdateEnvelope>): TFilterResults<TUserUpdateEnvelope> {
    const results: TFilterResults<TUserUpdateEnvelope> = {
      toSkip: [],
      toInsert: [],
      toUpdate: [],
      toDelete: []
    };

    envelopes.forEach((envelope: TUserUpdateEnvelope) => {
      if (_.get(envelope, "message.user.email", "n/a") === "n/a" && this.ignoreUsersWithoutEmail) {
        envelope.skipReason = SHARED_MESSAGES.SKIP_NOEMAIL;
        envelope.opsResult = "skip";
        return results.toSkip.push(envelope);
      }

      if (!this.matchesSynchronizedSegments(envelope) && !this.deletionEnabled) {
        envelope.skipReason = SHARED_MESSAGES.SKIP_NOTINSEGMENTS;
        envelope.opsResult = "skip";
        return results.toSkip.push(envelope);
      }

      if (this.deletionEnabled && !this.matchesSynchronizedSegments(envelope) && _.get(envelope, "message.user.traits_customerio/created_at", null) !== null) {
        return results.toDelete.push(envelope);
      } else if (this.deletionEnabled && !this.matchesSynchronizedSegments(envelope) && _.get(envelope, "message.user.traits_customerio/created_at", null) === null) {
        envelope.skipReason = SHARED_MESSAGES.SKIP_NOTINSEGMENTS;
        envelope.opsResult = "skip";
        return results.toSkip.push(envelope);
      }

      console.log(envelope.user);
      if (_.isNil(_.get(envelope, `message.user.${this.userAttributeServiceId}`, null))) {
        envelope.skipReason = SHARED_MESSAGES.SKIP_NOIDVALUE;
        envelope.opsResult = "skip";
        return results.toSkip.push(envelope);
      }

      if (_.get(envelope, "message.user.traits_customerio/created_at", null) === null) {
        return results.toInsert.push(envelope);
      }

      return results.toUpdate.push(envelope);
    });
    return results;
  }

  /**
   * Checks whether a message matches the synchronized segments.
   *
   * @param {TUserUpdateEnvelope} envelope The envelope.
   * @returns {boolean} True if at least one segments matches; otherwise False.
   * @memberof FilterUtil
   */
  matchesSynchronizedSegments(envelope: TUserUpdateEnvelope): boolean {
    const msgSegmentIds: Array<string> = _.get(envelope.message, this.segmentPropertyName, "segments").map(s => s.id);
    if (_.intersection(msgSegmentIds, this.synchronizedSegments).length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Deduplicates messages by user.id and joins all events into a single message.
   *
   * @param {Array<THullUserUpdateMessage>} messages The list of messages to deduplicate.
   * @returns {Array<TUserUpdateEnvelope>} A list of unique messages.
   * @memberof FilterUtil
   */
  deduplicateMessages(messages: Array<THullUserUpdateMessage>): Array<TUserUpdateEnvelope> {
    if (!messages || !_.isArray(messages) || messages.length === 0) {
      return [];
    }

    return _.chain(messages)
      .groupBy("user.id")
      .map((msgs: Array<THullUserUpdateMessage>) => {
        const usrMsg = _.cloneDeep(_.last(_.sortBy(msgs, ["user.indexed_at"])));
        const hashedEvents = {};
        _.set(usrMsg, "events", []);
        msgs.forEach((m: THullUserUpdateMessage) => {
          m.events.forEach(e => {
            if (_.get(hashedEvents, e.id, null) === null) {
              usrMsg.events.push(e);
              _.set(hashedEvents, e.id, e);
            }
          });
        });
        return { message: usrMsg };
      })
      .value();
  }

  /**
   * Filters the events which match the filer criteria.
   *
   * @param {Array<ICustomerIoEvent>} events The list of events to filter.
   * @returns {TFilterResults<ICustomerIoEvent>} The filter list of events.
   * @memberof FilterUtil
   */
  filterEvents(events: Array<ICustomerIoEvent>): TFilterResults<ICustomerIoEvent> {
    const results: TFilterResults<ICustomerIoEvent> = {
      toSkip: [],
      toInsert: [],
      toUpdate: [],
      toDelete: []
    };

    events.forEach((e: ICustomerIoEvent) => {
      if (!_.includes(this.synchronizedEvents, e.name)) {
        return results.toSkip.push(e);
      }
      return results.toInsert.push(e);
    });

    return results;
  }
}

module.exports = FilterUtil;
