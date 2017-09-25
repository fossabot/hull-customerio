/* @flow */
import express from "express";
import { notifHandler } from "hull/lib/utils";
import bodyParser from "body-parser";

import webhookHandler from "./actions/webhook-handler";
import applyAgent from "./middlewares/apply-agent";
import * as actions from "./actions";
import requireConfiguration from "./middlewares/check-connector-configuration";
import { encrypt } from "./lib/crypto";

export default function server(app: express, { bottleneckCluster, hostSecret }: Object) {
  app.get("/admin.html", (req, res) => {
    const token = encrypt(req.hull.config, hostSecret);
    res.render("admin.html", { hostname: req.hostname, token });
  });

  app.use(applyAgent(bottleneckCluster));

  app.all("/webhook", bodyParser.json(), webhookHandler);

  app.use(requireConfiguration);

  app.use("/batch", notifHandler({
    userHandlerOptions: {
      groupTraits: false
    },
    handlers: {
      "user:update": actions.batchHandler
    }
  }));

  app.use("/notify", notifHandler({
    userHandlerOptions: {
      groupTraits: false
    },
    handlers: {
      "user:update": actions.updateUser
    }
  }));

  return app;
}
