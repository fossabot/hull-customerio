/* @flow */
import Hull from "hull";
import express from "express";
import { Cluster } from "bottleneck";

import server from "./server";

const {
  LOG_LEVEL,
  SECRET,
  PORT,
  OVERRIDE_FIREHOSE_URL,
} = process.env;

if (LOG_LEVEL) {
  Hull.logger.transports.console.level = LOG_LEVEL;
}

Hull.logger.transports.console.json = true;

const options = {
  hostSecret: SECRET || "1234",
  port: PORT || 8082,
  clientConfig: {
    firehoseUrl: OVERRIDE_FIREHOSE_URL
  }
};

const app = express();
const bottleneckCluster = new Cluster(30, 34);
const connector = new Hull.Connector(options);

connector.setupApp(app);
server(app, bottleneckCluster);
connector.startApp(app);
