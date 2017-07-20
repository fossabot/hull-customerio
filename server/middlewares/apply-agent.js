/* @flow */
import { Request, Response, Next } from "express";
import SyncAgent from "../lib/sync-agent";
import Bottleneck from "bottleneck";

export default function applyAgent(bottleneck: Bottleneck, customerioSiteId: string, customerioApiKey: string) {
  return (req: Request, res: Response, next: Next) => {
    req.hull.syncAgent = new SyncAgent(req.hull, bottleneck, customerioSiteId, customerioApiKey);
    return next();
  };
}
