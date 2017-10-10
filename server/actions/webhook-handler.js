/* @flow */
import { Request, Response } from "express";
import _ from "lodash";

import eventsMapping from "../mappings/events-mapping";

export default function webhookHandler(req: Request, res: Response) {
  res.send();

  const userIdMapping = _.get(req, "hull.ship.private_settings.user_id_mapping");

  if (!req.body || !req.body.event_id) {
    return Promise.resolve();
  }


  const { data: { email_address, email_id, customer_id, campaign_id, campaign_name, template_id, subject }, event_type, timestamp, event_id } = req.body;

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

  const userIdent = {};
  if (userIdMapping === "external_id") {
    userIdent.external_id = customer_id;
  } else {
    userIdent.email = user.email;
  }

  const asUser = req.hull.client.asUser(userIdent);

  const eventPayload = { email_address, email_id, template_id, email_subject: subject, customer_id, campaign_id, campaign_name };

  const context = {
    ip: "0",
    event_id,
    created_at: timestamp
  };

  asUser.logger.debug("incoming.webhook", req.body);

  return asUser.track(eventName, eventPayload, context).then(() => {
    asUser.logger.info("incoming.event.success", eventName);
    req.hull.metric.increment("ship.incoming.events", 1);
  }, (error) => {
    asUser.logger.error("incoming.event.error", error);
    req.hull.metric.increment("ship.errors", 1);
  });
}
