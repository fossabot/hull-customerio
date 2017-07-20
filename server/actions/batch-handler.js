/* @flow */
import _ from "lodash";

export default function batchHandler({ ship, syncAgent }: any, messages: Array<any> = []) {
  if (_.get(ship.private_settings, "deleteUsers")) {
    const filterSegments = _.get(ship.private_settings, "synchronized_segments");

    const usersToSend = [];
    const usersToDelete = [];

    messages.forEach(message => {
      if (_.intersection(message.segments.map(s => s.id), filterSegments).length > 0) usersToSend.push(message.user);
      else usersToDelete.push(message.user);
    });

    return syncAgent.deleteBatchOfUsers(usersToDelete).then(() => syncAgent.sendBatchOfUsers(usersToSend));
  }

  return syncAgent.sendBatchOfUsers(messages.map(m => m.user));
}
