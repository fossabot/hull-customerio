/* @flow */
import express from "express";
import Bottleneck from "bottleneck";
import { notifHandler } from "hull/lib/utils";

import webhookHandler from "./actions/webhook-handler";
import ApplyAgent from "./middlewares/apply-agent";
import * as actions from "./actions";
import requireConfiguration from "./middlewares/check-connector-configuration";

export default function Server(app: express, bottleneck: Bottleneck) {
  app.get("/admin.html", (req, res) => {
    res.render("admin.html", { hostname: req.hostname, token: req.hull.token });
  });

  app.use("/webhooks", webhookHandler);

  app.use(ApplyAgent(bottleneck), requireConfiguration);

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
