/* @flow */
import _ from "lodash";

export default function updateUser({ client, service, ship }: Object, messages: []) {
  const shouldSendAnonymousEvents = _.has(ship, "private_settings.anonymous_events");
  const filterSegments = _.get(ship, "private_settings.synchronized_segments");
  const eventsFilter = _.get(ship, "private_settings.events_filter", []);
  const userDeletionEnabled = _.get(ship, "private_settings.enable_user_deletion");

  const filterEvents = (user, e, segments) => {
    const asUser = client.asUser(user);
    if (!_.includes(eventsFilter, e.event)) {
      asUser.logger.info("outgoing.event.skip", {
        eventName: e.event, reason: "event not included in events_filter private setting"
      });
      return false;
    }

    if (_.intersection(segments.map(s => s.id), filterSegments).length === 0) {
      asUser.logger.info("outgoing.event.skip", {
        eventName: e.event, reason: "user does not belong to segments that are set to be synchronized"
      });
      return false;
    }
    return true;
  };

  const { syncAgent } = service;
  return Promise.all(messages.map(({ user, segments, events, changes }) => {
    const promises = [];

    if (!_.get(changes, "user['traits_customerio/id'][1]", false)) {
      if (_.intersection(segments.map(s => s.id), filterSegments).length > 0) {
        promises.push(syncAgent.sendAllUserProperties(user, segments));
      } else if (userDeletionEnabled && _.get(user, "traits_customerio/deleted_at") !== null && _.get(user, "traits_customerio/id")) {
        promises.push(syncAgent.deleteUser(user));
      }
    }

    promises.push(events.filter(event => filterEvents(user, event, segments)).reduce((acc, e) => {
      const usersCustomerioId = syncAgent.getUsersCustomerioId(user);

      if (e.event === "page" && usersCustomerioId) {
        acc.push(syncAgent.sendPageEvent(user, e.properties.url, e));
      } else if (usersCustomerioId) {
        const userIdent = { email: user.email };
        userIdent[syncAgent.getIdMapping()] = usersCustomerioId;
        acc.push(syncAgent.sendUserEvent(userIdent, e.event, e));
      } else if (shouldSendAnonymousEvents) {
        acc.push(syncAgent.sendAnonymousEvent(e.event, e));
      }

      return acc;
    }, []));

    return Promise.all(promises);
  }));
}
