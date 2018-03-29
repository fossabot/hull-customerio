/* global describe, it, beforeEach, afterEach */

const Minihull = require("minihull");
const assert = require("assert");
const bootstrap = require("./support/bootstrap");
const superagent = require("superagent");

describe("Connector Endpoints", function test() {
  let minihull;
  let server;

  const private_settings = {};

  beforeEach(done => {
    minihull = new Minihull();
    server = bootstrap();
    minihull.listen(8001).then(done);
    minihull.stubConnector({ id: "123456789012345678901234", private_settings });
    minihull.stubSegments([{
      name: "testSegment",
      id: "hullSegmentId"
    }]);
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  it("should return status ok for admin.html endpoint", done => {
    superagent.get("http://localhost:8000/admin.html").then(res => {
      assert.equal(res.status, 200);
      done();
    });
  });
});
