/* @flow */
import type { TReqContext, THullUserUpdateMessage } from "hull";

const SyncAgent = require("../lib/sync-agent");
const Promise = require("bluebird");

function updateUser(ctx: TReqContext, messages: Array<THullUserUpdateMessage>): Promise<*> {
  const syncAgent = new SyncAgent(ctx);
  return syncAgent.sendUserMessages(messages);
}

module.exports = updateUser;
