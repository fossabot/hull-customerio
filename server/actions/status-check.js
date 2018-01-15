/* @flow */

import { Request, Response } from "express";
import _ from "lodash";

export default function statusCheckAction(req: Request, res: Response): Promise<*> {
  if (req.hull && req.hull.ship && req.hull.ship.private_settings) {
    const { ship = {}, client = {}, service = {} } = req.hull;
    const messages = [];
    let status = "ok";
    const pushMessage = (message) => {
      status = "error";
      messages.push(message);
    };
    const promises = [];

    if (_.isEmpty(_.get(ship, "private_settings.synchronized_segments", []))) {
      pushMessage("No users will be synchronized because of missing whitelisted Segments");
    }

    if (!service.syncAgent.isConfigured()) {
      pushMessage("Missing Credentials");
    } else {
      promises.push(service.syncAgent.checkAuth()
        .then(() => {

        }).catch(err => {
          if (_.get(err, "response.status") === 401) {
            return pushMessage("API Credentials are invalid");
          }
          return pushMessage(`Error when trying to connect with Customer.io: ${_.get(err, "message", "Unknown")}`);
        })
      );
    }

    const handleResponse = () => {
      res.json({ status, messages });
      client.logger.debug("ship.status", { status, messages });
      return client.put(`${ship.id}/status`, { status, messages });
    };

    return Promise.all(promises)
    .catch(err => {
      pushMessage(_.get(err, "message", "Unknown error"));
    })
    .then(handleResponse);
  }

  return res.status(401).json({ status: 404, messages: ["Connector not found"] });
}
