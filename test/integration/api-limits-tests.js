/* global describe, it, beforeEach, afterEach */

import Minihull from "minihull";
import assert from "assert";
import _ from "lodash";
import bootstrap from "./support/bootstrap";
import CustomerioMock from "./support/customerio-mock";

describe("Connector should respect API limits", function test() {
  let minihull;
  let server;
  const customerioMock = new CustomerioMock();

  const private_settings = {
    synchronized_segments: ["hullSegmentId"],
    user_id_mapping: "test_id",
    site_id: "1",
    api_key: "2"
  };

  beforeEach((done) => {
    minihull = new Minihull();
    server = bootstrap();
    minihull.listen(8001);
    minihull.stubConnector({ id: "123456789012345678901234", private_settings });
    minihull.stubSegments([{
      name: "testSegment",
      id: "hullSegmentId"
    }]);

    setTimeout(() => {
      done();
    }, 1000);
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  it("should send attributes in 30 count batches", (done) => {
    const range = _.range(35);

    const hullUserIdent = { email: "333@test.com" };
    const hullUserFields = _.zipObject(range.map(i => `field_${i}`), range);

    private_settings.synchronized_attributes = Object.keys(hullUserFields);

    const firstBatchNock = customerioMock.setUpIdentifyCustomerNock("33333", "333@test.com",
      _.pickBy(hullUserFields, (v) => v < 28));

    const secondBatchNock = customerioMock.setUpNextIdentifyBatchCusotomerNock("33333", _.pickBy(hullUserFields, (v) => v >= 28));

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: _.merge({ test_id: "33333" }, hullUserIdent, hullUserFields),
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      minihull.on("incoming.request", (req) => {
        firstBatchNock.done();
        secondBatchNock.done();
        const requestData = req.body.batch[0];

        assert(requestData.type === "traits");
        assert.equal(_.get(requestData.body, "customerio/email"), "333@test.com");
        assert(_.get(requestData.body, "customerio/created_at"));
        assert.equal(_.get(requestData.body, "customerio/id"), "33333");
        range.forEach(idx => assert(_.get(requestData.body, `customerio/field_${idx}`) === idx));

        done();
      });
    });
  });
});

