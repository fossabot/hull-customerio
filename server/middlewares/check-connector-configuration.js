/* @flow */
import _ from "lodash";
import { Request, Response, Next } from "express";

export default function checkConnectorConfiguration(req: Request, res: Response, next: Next) {
  if (req.hull.message && req.hull.message.Type === "SubscriptionConfirmation") {
    return next();
  }

  const syncAgent = _.get(req, "hull.service.syncAgent");

  if (syncAgent && !syncAgent.isConfigured()) {
    req.hull.client.logger.error("connector.configuration.error", { errors: "connector not configured" });
    return res.status(403).send("Connector is not configured");
  }
  return next();
}
