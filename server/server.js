/* @flow */
import type { $Application, $Response } from "express";
import type { TRequest, THullReqContext } from "hull";

const { notifHandler, smartNotifierHandler, THullUserUpdateMessage } = require("hull/lib/utils");
const bodyParser = require("body-parser");

const {
  webhookHandler,
  statusCheck,
  updateUser
} = require("./actions");
const { encrypt } = require("./lib/crypto");

function server(app: $Application, { hostSecret }: Object): $Application {
  app.get("/admin.html", (req: TRequest, res: $Response) => {
    const token = encrypt(req.hull.config, hostSecret);
    res.render("admin.html", { hostname: req.hostname, token });
  });

  app.all("/webhook", bodyParser.json(), webhookHandler);

  app.all("/status", statusCheck);

  app.use("/batch", smartNotifierHandler({
    userHandlerOptions: {
      groupTraits: false
    },
    handlers: {
      "user:update": updateUser
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
      "user:update": (ctx: THullReqContext, messages: Array<THullUserUpdateMessage>) => {
        if (ctx.smartNotifierResponse) {
          ctx.smartNotifierResponse.setFlowControl({
            type: "next",
            in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 1000,
            size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 100
          });
        }
        return updateUser(ctx, messages);
      },
      "account:update": (ctx: THullReqContext) => {
        if (ctx.smartNotifierResponse) {
          ctx.smartNotifierResponse.setFlowControl({
            type: "next",
            in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 1000,
            size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 100
          });
        }
        return Promise.resolve();
      },
      "ship:update": (ctx: THullReqContext) => {
        if (ctx.smartNotifierResponse) {
          ctx.smartNotifierResponse.setFlowControl({
            type: "next",
            in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 1000,
            size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 100
          });
        }
        return Promise.resolve();
      },
      "organization:report": (ctx: THullReqContext) => {
        if (ctx.smartNotifierResponse) {
          ctx.smartNotifierResponse.setFlowControl({
            type: "next",
            in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 1000,
            size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 100
          });
        }
        return Promise.resolve();
      }
    }
  }));

  return app;
}

module.exports = server;
