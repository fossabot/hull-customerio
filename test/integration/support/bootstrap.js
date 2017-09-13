import { Connector } from "hull";
import express from "express";

import server from "../../../server/server";
import { Cluster } from "bottleneck";
import { middleware } from "../../../server/lib/crypto";

export default function bootstrap() {
  const app = express();
  const connector = new Connector({ hostSecret: "1234", port: 8000, clientConfig: { protocol: "http", firehoseUrl: "firehose" } });
  app.use(middleware(connector.hostSecret));
  connector.setupApp(app);
  server(app, { bottleneckCluster: new Cluster(30, 34), hostSecret: "1234" });
  return connector.startApp(app);
}
