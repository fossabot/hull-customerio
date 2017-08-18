/* @flow */
import _ from "lodash";

export default function updateUser({ client, service, ship }: Object, messages: []) {
  const shouldSendAnonymousEvents = _.get(ship, "private_settings.anonymous_events");
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
        eventName: e.event
      });
      return false;
    }

    if (_.get(user, "traits_customerio/deleted_at")) {
      client.asUser(user).logger.info("outgoing.event.skip", {
        eventName: e.event,
        reason: "User was deleted"
      });
      return false;
    }
    return true;
  };

  const { syncAgent } = service;
  return Promise.all(messages.map(({ user, segments, events, changes }) => {
    const userPromises = [];

    if (!_.get(changes, "user['traits_customerio/id'][1]", false)) {
      if (_.intersection(segments.map(s => s.id), filterSegments).length > 0) {
        userPromises.push(syncAgent.sendAllUserProperties(user, segments));
      } else if (userDeletionEnabled && !_.get(user, "traits_customerio/deleted_at") && _.get(user, "traits_customerio/id")) {
        userPromises.push(syncAgent.deleteUser(user));
      } else {
        client.asUser(user).logger.info("outgoing.user.skip", {
          id: syncAgent.getUsersCustomerioId(user),
          reason: "User is not included in synchronized segments setting and: user deletion is disabled or he was deleted"
        });
      }
    }

    return Promise.all(userPromises).then(() =>
      Promise.all(events.filter(event => filterEvents(user, event, segments)).reduce((acc, e) => {
        const usersCustomerioId = syncAgent.getUsersCustomerioId(user);

        if (e.event === "page" && usersCustomerioId) {
          acc.push(syncAgent.sendPageEvent(user, e.properties.url, e));
        } else if (usersCustomerioId) {
          const userIdent = { email: user.email };
          userIdent[syncAgent.getIdMapping()] = usersCustomerioId;
          acc.push(syncAgent.sendUserEvent(userIdent, e.event, e));
        } else if (shouldSendAnonymousEvents) {
          acc.push(syncAgent.sendAnonymousEvent(e.event, e));
        } else {
          client.asUser(user).logger.info("outgoing.event.skip", {
            eventName: e.event,
            reason: "User is missing property that should be sent as user's id to customer.io and sending anonymous events is disabled."
          });
        }

        return acc;
      }, []))
    );
  }));
}
