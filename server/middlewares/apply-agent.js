/* @flow */
import type { $Response, NextFunction } from "express";
import type { TRequest } from "hull";

const SyncAgent = require("../lib/sync-agent");
const CustomerioClient = require("../lib/customerio-client");

function applyAgent(): Function {
  return (req: TRequest, res: $Response, next: NextFunction) => {
    if (req.hull && req.hull.ship) {
      req.hull = req.hull || {};
      req.hull.service = req.hull.service || {};

      const customerioClient = new CustomerioClient(req.hull);

      req.hull.service.syncAgent = new SyncAgent(req.hull, customerioClient);
    }
    return next();
  };
}

module.exports = applyAgent;
