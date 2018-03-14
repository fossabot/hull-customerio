/* @flow */
import { IContext } from "../lib/types";

const _ = require("lodash");
const Promise = require("bluebird");
const SyncAgent = require("../lib/sync-agent");

function updateUser(ctx: IContext, messages: Array<Object>): Promise<any> {
  const { ship = {}, client = {}, metric } = ctx;
  const syncAgent = new SyncAgent(client, ship, metric);

  const shouldSendAnonymousEvents = _.get(ship, "private_settings.anonymous_events", false);
  const filterSegments = _.get(ship, "private_settings.synchronized_segments", []);
  const eventsFilter = _.get(ship, "private_settings.events_filter", []);
  const userDeletionEnabled = _.get(ship, "private_settings.enable_user_deletion", false);

  const filterEvents = (user, e, segments) => {
    const asUser = client.asUser(user);

    if (!_.includes(eventsFilter, e.event)) {
      asUser.logger.info("outgoing.event.skip", {
        eventName: e.event, reason: `The event '${e.event}' is not included in whitelisted events in Settings.`
      });
      return false;
    }

    if (_.intersection(segments.map(s => s.id), filterSegments).length === 0) {
      return false;
    }

    if (_.get(user, "traits_customerio/deleted_at")) {
      client.asUser(user).logger.info("outgoing.event.skip", { eventName: e.event, reason: "The event has not been processed because the corresponding user has been deleted from customer.io." });
      return false;
    }
    return true;
  };

  return Promise.all(messages.map(({
    user, segments, events, changes
  }) => {
    const userPromises = [];
    if (!_.get(changes, "user['traits_customerio/created_at'][1]", false) || !_.get(changes, "user['traits_customerio/deleted_at'][1]", false)) {
      if (_.intersection(segments.map(s => s.id), filterSegments).length > 0) {
        userPromises.push(syncAgent.sendAllUserProperties(user, segments));
      } else if (userDeletionEnabled && !_.get(user, "traits_customerio/deleted_at")) {
        userPromises.push(syncAgent.deleteUser(user));
      } else {
        client.asUser(user).logger.info("outgoing.user.skip", {
          id: syncAgent.getUsersCustomerioId(user),
          reason: "The user is either not part of the whitelisted segments setting or there are no changes to process."
        });
      }
    }

    return Promise.all(userPromises).then(() =>
      Promise.all(events.filter(event => filterEvents(user, event, segments)).reduce((acc, e) => {
        const usersCustomerioId = syncAgent.getUsersCustomerioId(user);

        if (e.event === "page" && usersCustomerioId) {
          acc.push(syncAgent.sendPageEvent(user, e.properties.url, e.properties));
        } else if (usersCustomerioId) {
          const userIdent = { email: user.email };
          userIdent[syncAgent.getIdMapping()] = usersCustomerioId;
          acc.push(syncAgent.sendUserEvent(userIdent, e.event, e.properties));
        } else if (shouldSendAnonymousEvents) {
          acc.push(syncAgent.sendAnonymousEvent(e.event, e.properties));
        } else {
          client.asUser(user).logger.info("outgoing.event.skip", {
            eventName: e.event,
            reason: "The user doesn't have a value for the attribute which serves as identifier for customer.io and anonymous events are disabled in Settings."
          });
        }

        return acc;
      }, [])));
  }));
}

module.exports = updateUser;
