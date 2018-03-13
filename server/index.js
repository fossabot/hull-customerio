/* @flow */
import Hull from "hull";
import express from "express";
import { middleware } from "./lib/crypto";

import server from "./server";

const {
  LOG_LEVEL,
  SECRET,
  PORT
} = process.env;

if (LOG_LEVEL) {
  Hull.logger.transports.console.level = LOG_LEVEL;
}

Hull.logger.transports.console.json = true;

const options = {
  hostSecret: SECRET || "1234",
  port: PORT || 8082
};

const app = express();
const connector = new Hull.Connector(options);

app.use(middleware(connector.hostSecret));

connector.setupApp(app);
server(app, { hostSecret: options.hostSecret });
connector.startApp(app);
