const Hull = require("hull");
const express = require("express");
const server = require("../../../server/server");
const { middleware } = require("../../../server/lib/crypto");

function bootstrap() {
  const app = express();
  Hull.logger.transports.console.level = "debug";
  const connector = new Hull.Connector({
    hostSecret: "1234",
    port: 8000,
    clientConfig: { protocol: "http", firehoseUrl: "firehose" },
    skipSignatureValidation: true
  });
  app.use(middleware(connector.hostSecret));
  connector.setupApp(app);
  server(app, { hostSecret: "1234" });
  return connector.startApp(app);
}

module.exports = bootstrap;
