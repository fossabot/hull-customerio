/* @flow */
import { Request, Response } from "express";
import _ from "lodash";

import eventsMapping from "../mappings/events-mapping";

export default function webhookHandler(req: Request, res: Response) {
  res.send();
  const reqContent = req.body;

  const eventName = _.get(eventsMapping, reqContent.event_type);
  if (!eventName) {
    return Promise.resolve();
  }

  const user = {
    email: reqContent.data.email_address
  };

  const asUser = req.hull.client.asUser({ email: user.email });

  const eventPayload = {
    eventName,
    user
  };

  const context = {
    event_id: reqContent.data.event_id,
    created_at: reqContent.timestamp
  };

  return asUser.track(eventPayload, context);
}
