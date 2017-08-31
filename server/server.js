/* @flow */
import express from "express";
import { notifHandler, smartNotifierHandler } from "hull/lib/utils";

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

  app.post("/webhook", webhookHandler);

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

  app.use("/smart-notifier", smartNotifierHandler({
    handlers: {
      "user:update": (ctx: Object, messages: Array<Object>) => {
        ctx.smartNotifierResponse.setFlowControl({
          type: "next",
          in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 1000,
          size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 100
        });
        return actions.updateUser(ctx, messages);
      }
    }
  }));


  return app;
}
