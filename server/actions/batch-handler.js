/* @flow */
import _ from "lodash";

export default function batchHandler({ ship, service: { syncAgent } }: Object, messages: Array<Object> = []) {
  if (_.get(ship, "private_settings.enable_user_deletion")) {
    const filterSegments = _.get(ship, "private_settings.synchronized_segments");

    const usersToSend = [];
    const usersToDelete = [];

    messages.forEach(message => {
      if (_.intersection(message.segments.map(s => s.id), filterSegments).length > 0) usersToSend.push({ user: message.user, segments: message.segments });
      else usersToDelete.push(message.user);
    });

    return syncAgent.deleteBatchOfUsers(usersToDelete).then(() => syncAgent.sendBatchOfUsers(usersToSend));
  }

  return syncAgent.sendBatchOfUsers(messages.map(m => ({ user: m.user, segments: m.segments })));
}
