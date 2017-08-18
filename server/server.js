/* @flow */
import express from "express";
import { Cluster } from "bottleneck";
import { notifHandler } from "hull/lib/utils";

import webhookHandler from "./actions/webhook-handler";
import applyAgent from "./middlewares/apply-agent";
import * as actions from "./actions";
import requireConfiguration from "./middlewares/check-connector-configuration";

export default function server(app: express, bottleneckCluster: Cluster) {
  app.get("/admin.html", (req, res) => {
    res.render("admin.html", { hostname: req.hostname, token: req.hull.token });
  });

  app.use(applyAgent(bottleneckCluster));

  app.all("/webhook", webhookHandler);

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
