/* @flow */
import { Request, Response } from "express";
import _ from "lodash";

import eventsMapping from "../mappings/events-mapping";

export default function webhookHandler(req: Request, res: Response) {
  res.send();
  if (!req.body || !req.body.event_id) {
    return Promise.resolve();
  }

  const { data: { email_address, customer_id, campaign_id, template_id, subject }, event_type, timestamp, event_id } = req.body;

  if (event_id === "abc123") {
    req.hull.client.logger.debug("webhook endpoint subscribed");
    return Promise.resolve();
  }

  const eventName = _.get(eventsMapping, event_type);
  if (!eventName) {
    return Promise.resolve();
  }

  const user = {
    email: email_address
  };

  const asUser = req.hull.client.asUser({ email: user.email });

  const eventPayload = { user, template_id, subject, customer_id, campaign_id };

  const context = {
    event_id,
    created_at: timestamp
  };

  return asUser.track(eventName, eventPayload, context).then(() => {
    asUser.logger.info("incoming.event.success", eventName);
    req.hull.metric.increment("ship.incoming.events", 1);
  }, (error) => {
    asUser.logger.error("incoming.event.error", error);
  });
}
