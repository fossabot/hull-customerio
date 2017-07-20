/* @flow */
import { Request, Response, Next } from "express";
import SyncAgent from "../lib/sync-agent";
import Bottleneck from "bottleneck";

export default function applyAgent(bottleneck: Bottleneck) {
  return (req: Request, res: Response, next: Next) => {
    req.hull.service.syncAgent = new SyncAgent(req.hull, bottleneck);
    return next();
  };
}
