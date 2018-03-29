/* @flow */
import type { TUserUpdateEnvelope, TFilterResults, IOperationsUtilOptions, ICustomerIoEvent } from "../types";

const _ = require("lodash");

const FilterUtil = require("./sync-agent/filter-util");
const MappingUtil = require("./sync-agent/mapping-util");

function combineUserAccount(envelopes: Array<TUserUpdateEnvelope>): Array<TUserUpdateEnvelope> {
  return _.map(envelopes, (envelope) => {
    const hullUser = _.cloneDeep(_.get(envelope, "message.user", {}));
    _.set(hullUser, "account", _.get(envelope, "message.account", {}));
    _.set(envelope, "hullUser", hullUser);
    return envelope;
  });
}


class OperationsUtil {

  segmentPropertyName: string;

  filterUtil: FilterUtil;

  mappingUtil: MappingUtil;

  constructor(options: IOperationsUtilOptions) {
    this.segmentPropertyName = options.segmentPropertyName;
  }

  composeCombinedUserAccountObject(filterResult: TFilterResults<TUserUpdateEnvelope>): TFilterResults<TUserUpdateEnvelope> {
    return {
      toSkip: combineUserAccount(filterResult.toSkip),
      toInsert: combineUserAccount(filterResult.toInsert),
      toUpdate: combineUserAccount(filterResult.toUpdate),
      toDelete: combineUserAccount(filterResult.toDelete)
    };
  }

  composeServiceObjects(envelope: TUserUpdateEnvelope): TUserUpdateEnvelope {
    envelope.customer = this.mappingUtil.mapToServiceUser(envelope.hullUser, _.get(envelope, `message.${this.segmentPropertyName}`, []));
    const allEvents = _.map(_.get(envelope, "message.events", []), (event) => this.mappingUtil.mapToServiceEvent(event));
    const filteredEvents: TFilterResults<ICustomerIoEvent> = this.filterUtil.filterEvents(allEvents);
    envelope.customerEvents = filteredEvents.toInsert;
    envelope.customerEventsToSkip = filteredEvents.toSkip;
    return envelope;
  }
}

module.exports = OperationsUtil;
