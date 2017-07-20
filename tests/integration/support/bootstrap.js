import { Connector } from "hull";
import express from "express";

import Server from "../../../server/server";
import Bottleneck from "bottleneck";

export default function bootstrap() {
  let app = express();
  const connector = new Connector({ hostSecret: "1234", port: 8000, clientConfig: { protocol: "http", firehoseUrl: "firehose" } });
  connector.setupApp(app);
  app = Server(app, new Bottleneck(30, 34), { customerioSiteId: "", customerioApiKey: "" });

  connector.startWorker();
  return connector.startApp(app);
}
