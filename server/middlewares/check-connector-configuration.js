/* @flow */
import _ from "lodash";
import { Request, Response, Next } from "express";
import { SmartNotifierError } from "hull/lib/utils/smart-notifier-response";

export default function checkConnectorConfiguration(req: Request, res: Response, next: Next) {
  if (req.hull.message && req.hull.message.Type === "SubscriptionConfirmation") {
    return next();
  }

  const syncAgent = _.get(req, "hull.service.syncAgent");

  if (syncAgent && !syncAgent.isConfigured()) {
    if (req.hull.smartNotifierResponse) {
      const error = new SmartNotifierError(
        "CONNECTOR_CONFIGURATION",
        "Connector is not configured",
        {
          type: "next",
          in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 1000,
          size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 100
        }
      );
      return next(error);
    }

    req.hull.client.logger.error("connector.configuration.error", { errors: "connector not configured" });
    return res.status(403).send("Connector is not configured");
  }
  return next();
}
