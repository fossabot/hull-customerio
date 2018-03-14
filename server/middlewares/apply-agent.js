/* @flow */
import { $Request, $Response, $Next } from "express";
import SyncAgent from "../lib/sync-agent";
import CustomerioClient from "../lib/customerio-client";

export default function applyAgent() {
  return (req: $Request, res: $Response, next: $Next) => {
    if (req.hull && req.hull.ship) {
      req.hull = req.hull || {};
      req.hull.service = req.hull.service || {};

      const customerioClient = new CustomerioClient(req.hull);

      req.hull.service.syncAgent = new SyncAgent(req.hull, customerioClient);
    }
    return next();
  };
}
