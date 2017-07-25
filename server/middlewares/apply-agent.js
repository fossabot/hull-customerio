/* @flow */
import { Request, Response, Next } from "express";
import Bottleneck from "bottleneck";
import _ from "lodash";
import SyncAgent from "../lib/sync-agent";
import CustomerioClient from "../lib/customerio-client";

export default function applyAgent(bottleneck: Bottleneck) {
  return (req: Request, res: Response, next: Next) => {
    req.hull.service = req.hull.service || {};

    const customerioClient = new CustomerioClient(
      _.get(req.hull.ship, "private_settings.site_id"),
      _.get(req.hull.ship, "private_settings.api_key"),
      bottleneck);

    req.hull.service.syncAgent = new SyncAgent(req.hull, customerioClient);
    return next();
  };
}
