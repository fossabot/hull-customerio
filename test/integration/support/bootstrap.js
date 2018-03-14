import { Connector } from "hull";
import express from "express";

import server from "../../../server/server";
import { middleware } from "../../../server/lib/crypto";

export default function bootstrap() {
  const app = express();
  const connector = new Connector({
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
