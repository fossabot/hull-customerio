import _ from "lodash";

export default function updateUser({ service, ship, client }: Object, messages: []) {
  const { syncAgent } = service;
  return Promise.all(messages.map(({ user, segments, events, changes }) => {
    const shouldSendAnonymousEvents = _.has(ship.private_settings, "anonymous_events");
    const eventsFilter = _.get(ship.private_settings, "events_filter", []);

    const promises = [];

    promises.push(events.filter(event => _.includes(eventsFilter, event.properties.name)).reduce((acc, e) => {
      const usersCustomerioId = _.get(user, _.get(user, "traits_customerio/id"), syncAgent.getUsersCustomerioId(user));

      if (e.event === "page") {
        acc.push(syncAgent.sendPageEvent(user, e.context.page, e));
      } else if (usersCustomerioId) {
        const userIdent = { email: user.email };
        userIdent[syncAgent.getIdMapping()] = usersCustomerioId;
        acc.push(syncAgent.sendUserEvent(userIdent, e.properties.name, e));
      } else if (shouldSendAnonymousEvents) {
        acc.push(syncAgent.sendAnonymousEvent(e.properties.name, e));
      }

      return acc;
    }, []));

    const filterSegments = _.get(ship.private_settings, "synchronized_segments");

    if (_.intersection(segments.map(s => s.id), filterSegments).length > 0) {
      if (!_.get(changes, "user['traits_customerio/id']", false)) {
        promises.push(syncAgent.sendAllUserProperties(user));
      }
    } else if (!_.get(user, "traits_customerio/deleted_at") && _.get(user, "traits_customerio/id")) {
      promises.push(syncAgent.deleteUser(user));
    }

    return Promise.all(promises);
  }));
}
