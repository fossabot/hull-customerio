/* @flow */
import { IContext } from "../lib/types";

const _ = require("lodash");
const SyncAgent = require("../lib/sync-agent");

function batchHandler(ctx: IContext, messages: Array<Object> = []) {
  const { ship = {}, client = {}, metric } = ctx;
  const syncAgent = new SyncAgent(client, ship, metric);

  const filterSegments = _.get(ship, "private_settings.synchronized_segments", []);

  // Do always check whitelisted segments, but only check users to delete
  // if flag is set:
  if (_.get(ship, "private_settings.enable_user_deletion", false)) {
    const usersToSend = [];
    const usersToDelete = [];

    messages.forEach(message => {
      if (_.intersection(message.segments.map(s => s.id), filterSegments).length > 0) usersToSend.push({ user: message.user, segments: message.segments });
      else usersToDelete.push(message.user);
    });

    messages.forEach(message => {
      if (_.intersection(message.segments.map(s => s.id), filterSegments).length > 0) usersToSend.push({ user: message.user, segments: message.segments });
    });

    return syncAgent.deleteBatchOfUsers(usersToDelete).then(() => syncAgent.sendBatchOfUsers(usersToSend));
  }

  return syncAgent.sendBatchOfUsers(messages.map(m => ({ user: m.user, segments: m.segments })));
}

module.exports = batchHandler;
