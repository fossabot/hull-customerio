/* global describe, it, beforeEach, afterEach */

import Minihull from "minihull";
import assert from "assert";
import bootstrap from "./support/bootstrap";
import axios from "axios";

describe("Connector Endpoints", function test() {
  let minihull;
  let server;

  const private_settings = {};

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


  it("should return 403 status if id mapping is undefined", (done) => {
    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: { email: "foo@test2.com", test_id: "34567", testAttribute: "test" },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).catch((error) => {
      assert.equal(error.status, 403);
      done();
    });
  });

  it("should return status ok for admin.html endpoint", (done) => {
    axios.get("http://localhost:8000/admin.html").then((res) => {
      assert.equal(res.status, 200);
      done();
    });
  });
});
