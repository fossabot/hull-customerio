/* global describe, it, beforeEach, afterEach */

import Minihull from "minihull";
import assert from "assert";
import _ from "lodash";
import bootstrap from "./support/bootstrap";
import CustomerioMock from "./support/customerio-mock";

describe("connector for notify endpoint", function test() {
  let minihull;
  let server;
  const customerioMock = new CustomerioMock();

  const private_settings = {
    synchronized_segments: ["hullSegmentId"],
    anonymous_events: "sure, why not",
    hull_user_id_mapping: "test_id",
    sync_fields_to_customerio: ["first_name", "last_name"]
  };

  beforeEach((done) => {
    minihull = new Minihull();
    server = bootstrap();
    minihull.listen(8001);

    minihull.stubConnector({
      id: "123456789012345678901234", private_settings
    });

    minihull.stubSegments([
      {
        name: "testSegment",
        id: "hullSegmentId"
      }
    ]);

    setTimeout(() => {
      done();
    }, 1000);
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  it("should send users to customer.io", (done) => {
    const createCustomerNock = customerioMock.setUpIdentifyCustomerNock("34567", "foo@bar.com", { first_name: "James", last_name: "Bond" });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: { email: "foo@bar.com", test_id: "34567", first_name: "James", last_name: "Bond" },
      changes: [],
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      minihull.on("incoming.request", (req) => {
        createCustomerNock.done();
        const requestData = req.body.batch[0];

        assert(requestData.type === "traits");
        assert(requestData.body.first_name === "James");
        assert(requestData.body.last_name === "Bond");
        assert(requestData.body.email === "foo@bar.com");
        assert(_.get(requestData.body, "traits_customerio/id") === "34567");

        done();
      });
    });
  });
});
