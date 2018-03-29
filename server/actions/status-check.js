/* @flow */
import type { $Response } from "express";
import type { TRequest } from "hull";

const _ = require("lodash");
const Promise = require("bluebird");

function statusCheckAction(req: TRequest, res: $Response): Promise<*> {
  if (_.has(req, "hull.ship.private_settings")) {
    const { ship, client } = req.hull;
    const { syncAgent } = req.hull.service;
    const messages: Array<string> = [];
    let status: string = "ok";
    const promises: Array<Promise> = [];

    if (_.isEmpty(_.get(ship, "private_settings.synchronized_segments", []))) {
      if (status !== "error") {
        status = "warning";
      }
      messages.push("No users will be synchronized because you have not specified at least one whitelisted segment in Settings.");
    }

    if (!syncAgent.isConfigured()) {
      status = "error";
      messages.push("Missing Credentials: Site ID or API Key are not configured in Settings.");
    } else {
      promises.push(syncAgent.checkAuth()
        .then(() => {

        }).catch(err => {
          status = "error";
          if (_.get(err, "response.status") === 401) {
            messages.push("Invalid Credentials: Verify Site ID and API Key in Settings.");
          }
          messages.push(`Error when trying to connect with Customer.io: ${_.get(err, "message", "Unknown Exception")}`);
        }));
    }

    const handleResponse = () => {
      res.json({ status, messages });
      client.logger.debug("ship.status", { status, messages });
      return client.put(`${ship.id}/status`, { status, messages });
    };

    return Promise.all(promises)
      .catch(err => {
        status = "error";
        messages.push(`Error when trying to determine the status: ${_.get(err, "message", "Unknown Exception")}`);
      })
      .then(handleResponse);
  }

  return Promise.resolve(() => {
    return res.status(401).json({ status: 404, messages: ["Connector not found"] });
  });
}

module.exports = statusCheckAction;
