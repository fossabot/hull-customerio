import _ from "lodash";
import moment from "moment";

export default function updateUser(ctx: Object, messages: []) {
  return Promise.all(messages.map(({ user, segments, events, changes }) => {
    const shouldSendAnonymousEvents = _.has(ctx.ship.private_settings, "anonymous_events");
    const eventsFilter = _.get(ctx.ship.private_settings, "events_filter", []);

    const promises = events.filter(event => _.includes(eventsFilter, event)).reduce((acc, e) => {
      const usersCustomerioId = _.get(user, _.get(user, "traits_customerio/id"), ctx.syncAgent.getUsersCustomerioId(user));

      if (e.event === "page") {
        acc.push(ctx.syncAgent.sendPageEvent(user, e.context.page, e));
      } else if (usersCustomerioId) {
        const userIdent = { email: user.email };
        userIdent[ctx.syncAgent.getIdMapping()] = usersCustomerioId;
        acc.push(ctx.syncAgent.sendUserEvent(userIdent, e.properties.name, e));
      } else if (shouldSendAnonymousEvents) {
        acc.push(ctx.syncAgent.sendAnonymousEvent(e.properties.name, e));
      }

      return acc;
    }, []);

    const filterSegments = _.get(ctx.ship.private_settings, "synchronized_segments");

    if (_.includes(segments.map(s => s.id), filterSegments)) {
      if (!_.get(changes, "user['traits_customerio/id']", false)) {
        promises.push(ctx.syncAgent.sendAllUserProperties(user));
      }
    } else if (!_.get(user, "traits_customerio/deleted_at")) {
      promises.push(
        ctx.syncAgent.deleteBatchOfUsers([user])
          .then(() => ctx.client.asUser(user).traits({ "traits_customerio/deleted_at": moment().format() }))
      );
    }

    return Promise.all(promises);
  }));
}
