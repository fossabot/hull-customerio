/* @flow */
import type { $Application, $Request, $Response } from "express";

const { notifHandler, smartNotifierHandler } = require("hull/lib/utils");
const bodyParser = require("body-parser");

const {
  webhookHandler,
  statusCheck,
  batchHandler,
  updateUser
} = require("./actions");

const { encrypt } = require("./lib/crypto");

function server(app: $Application, { hostSecret }: Object) {
  const adminHandler = (req: $Request, res: $Response) => {
    const token = encrypt(req.hull.config, hostSecret);
    res.render("admin.html", { hostname: req.hostname, token });
  };

  app.get("/admin.html", adminHandler);

  app.all("/webhook", bodyParser.json(), webhookHandler);

  app.all("/status", statusCheck);

  app.use("/batch", notifHandler({
    userHandlerOptions: {
      groupTraits: false
    },
    handlers: {
      "user:update": batchHandler
    }
  }));

  app.use("/notify", notifHandler({
    userHandlerOptions: {
      groupTraits: false
    },
    handlers: {
      "user:update": updateUser
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
        return updateUser(ctx, messages);
      }
    }
  }));

  return app;
}

module.exports = server;
