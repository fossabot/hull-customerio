/* @flow */
const Hull = require("hull");
const express = require("express");
const { middleware } = require("./lib/crypto");

const server = require("./server");

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
  port: PORT || 8082,
  timeout: "2m",
  skipSignatureValidation: process.env.SKIP_SIGNATURE_VALIDATION === "true"
};

const app = express();
const connector = new Hull.Connector(options);

app.use(middleware(connector.hostSecret));

connector.setupApp(app);
server(app, { hostSecret: options.hostSecret });
connector.startApp(app);
