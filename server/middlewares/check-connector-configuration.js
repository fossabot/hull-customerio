/* @flow */
import { Request, Response, Next } from "express";

export default function checkConnectorConfiguration(req: Request, res: Response, next: Next) {
  if (!req.hull.syncAgent.isConfigured()) {
    req.hull.client.logger.error("connector.configuration.error", { errors: "connector not configured" });
    return res.status(403).send("Ship is not configured");
  }
  return next();
}
