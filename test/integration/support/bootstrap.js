import { Connector } from "hull";
import express from "express";

import server from "../../../server/server";
import { Cluster } from "bottleneck";

export default function bootstrap() {
  const app = express();
  const connector = new Connector({ hostSecret: "1234", port: 8000, clientConfig: { protocol: "http", firehoseUrl: "firehose" } });
  connector.setupApp(app);
  server(app, new Cluster(30, 34));
  return connector.startApp(app);
}
