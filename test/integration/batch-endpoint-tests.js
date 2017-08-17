/* global describe, it, beforeEach, afterEach */

import Minihull from "minihull";
import assert from "assert";
import _ from "lodash";
import bootstrap from "./support/bootstrap";
import CustomerioMock from "./support/customerio-mock";

describe("Connector for batch endpoint if user deletion is enabled", function test() {
  let minihull;
  let server;
  const customerioMock = new CustomerioMock();

  const private_settings = {
    synchronized_segments: ["hullSegmentId"],
    anonymous_events: "true",
    user_id_mapping: "id",
    site_id: "1",
    api_key: "2",
    synchronized_attributes: ["first_name", "last_name"],
    events_filter: ["Page Event", "Custom Event", "Anonymous Event"],
    enable_user_deletion: "true",
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

  it("should send batch of users to customer.io", (done) => {
    const jamesVeitchCustomerNock = customerioMock.setUpIdentifyCustomerNock("22222", "222@test.com", {
      first_name: "James",
      last_name: "Veitch",
      hull_segments: "testSegment"
    });

    const johnSnowCustomerNock = customerioMock.setUpIdentifyCustomerNock("44444", "444@test.com", {
      first_name: "John",
      last_name: "Snow",
      hull_segments: "testSegment"
    });

    minihull.stubBatch([{
      email: "222@test.com", id: "22222", external_id: "1", anonymous_id: "2", first_name: "James", last_name: "Veitch",
      segment_ids: ["hullSegmentId"]
    }, {
      email: "444@test.com", id: "44444", external_id: "3", anonymous_id: "4", first_name: "John", last_name: "Snow",
      segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      minihull.on("incoming.request", (req) => {
        jamesVeitchCustomerNock.done();
        johnSnowCustomerNock.done();
        const jamesVeitchBatch = req.body.batch[0];
        const johnSnowBatch = req.body.batch[1];
        console.log(johnSnowBatch.body);

        assert.equal(jamesVeitchBatch.type, "traits");
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/first_name"), "James");
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/last_name"), "Veitch");
        assert(_.get(jamesVeitchBatch.body, "customerio/created_at"));
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/email"), "222@test.com");
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/id"), "22222");
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/id"), "22222");
        assert.equal(Object.keys(jamesVeitchBatch.body).length, 5);

        assert.equal(johnSnowBatch.type, "traits");
        assert.equal(_.get(johnSnowBatch.body, "customerio/first_name"), "John");
        assert.equal(_.get(johnSnowBatch.body, "customerio/last_name"), "Snow");
        assert(_.get(johnSnowBatch.body, "customerio/created_at"));
        assert.equal(_.get(johnSnowBatch.body, "customerio/email"), "444@test.com");
        assert.equal(_.get(johnSnowBatch.body, "customerio/id"), "44444");
        assert.equal(Object.keys(johnSnowBatch.body).length, 5);

        done();
      });
    });
  });

  it("should send batch of users to customer.io and delete users that do not match filtered segments", (done) => {
    const firstCustomerCreateNock = customerioMock.setUpIdentifyCustomerNock("22222", "222@test.com", {
      first_name: "James",
      last_name: "First",
      hull_segments: "testSegment"
    });

    const secondCustomerDeleteNock = customerioMock.setUpDeleteCustomerNock("44444");

    minihull.stubBatch([{
      email: "222@test.com", id: "22222", external_id: "1", anonymous_id: "2", first_name: "James", last_name: "First",
      segment_ids: ["hullSegmentId"]
    }, {
      email: "444@test.com", id: "44444", external_id: "3", anonymous_id: "4", first_name: "John", last_name: "Second"
    }]);

    let firstCheck = false;
    let secondCheck = false;

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      minihull.on("incoming.request", (req) => {
        const data = req.body.batch[0];

        if (_.get(data.body, "customerio/id") === "22222") {
          assert.equal(data.type, "traits");
          assert.equal(_.get(data.body, "customerio/first_name"), "James");
          assert.equal(_.get(data.body, "customerio/last_name"), "First");
          assert(_.get(data.body, "customerio/created_at"));
          assert.equal(_.get(data.body, "customerio/email"), "222@test.com");
          assert.equal(_.get(data.body, "customerio/id"), "22222");
          assert.equal(Object.keys(data.body).length, 5);
          firstCheck = true;
        } else {
          assert.equal(data.type, "traits");
          assert(_.get(data.body, "customerio/deleted_at"));
          assert.equal(Object.keys(data.body).length, 1);
          secondCheck = true;
        }
      });
    });

    setTimeout(() => {
      firstCustomerCreateNock.done();
      secondCustomerDeleteNock.done();
      if (!firstCheck) done("first check not satisfied");
      else if (!secondCheck) done("second check not satisfied");
      else done();
    }, 2500);
  }).timeout(3000);
});

describe("Connector for batch endpoint if user deletion is disabled", function test() {
  let minihull;
  let server;
  const customerioMock = new CustomerioMock();

  const private_settings = {
    synchronized_segments: ["hullSegmentId"],
    anonymous_events: "true",
    user_id_mapping: "id",
    site_id: "1",
    api_key: "2",
    synchronized_attributes: ["first_name", "last_name"],
    events_filter: ["Page Event", "Custom Event", "Anonymous Event"]
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

  it("should send batch of users to customer.io", (done) => {
    const jamesVeitchCustomerNock = customerioMock.setUpIdentifyCustomerNock("22222", "222@test.com", {
      first_name: "James",
      last_name: "Veitch",
      hull_segments: "testSegment"
    });

    const johnSnowCustomerNock = customerioMock.setUpIdentifyCustomerNock("44444", "444@test.com", {
      first_name: "John",
      last_name: "Snow",
      hull_segments: "testSegment"
    });

    minihull.stubBatch([{
      email: "222@test.com", id: "22222", external_id: "1", anonymous_id: "2", first_name: "James", last_name: "Veitch",
      segment_ids: ["hullSegmentId"]
    }, {
      email: "444@test.com", id: "44444", external_id: "3", anonymous_id: "4", first_name: "John", last_name: "Snow",
      segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      minihull.on("incoming.request", (req) => {
        jamesVeitchCustomerNock.done();
        johnSnowCustomerNock.done();
        const jamesVeitchBatch = req.body.batch[0];
        const johnSnowBatch = req.body.batch[1];

        assert.equal(jamesVeitchBatch.type, "traits");
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/first_name"), "James");
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/last_name"), "Veitch");
        assert(_.get(jamesVeitchBatch.body, "customerio/created_at"));
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/email"), "222@test.com");
        assert.equal(_.get(jamesVeitchBatch.body, "customerio/id"), "22222");
        assert.equal(Object.keys(jamesVeitchBatch.body).length, 5);

        assert.equal(johnSnowBatch.type, "traits");
        assert.equal(_.get(johnSnowBatch.body, "customerio/first_name"), "John");
        assert.equal(_.get(johnSnowBatch.body, "customerio/last_name"), "Snow");
        assert(_.get(johnSnowBatch.body, "customerio/created_at"));
        assert.equal(_.get(johnSnowBatch.body, "customerio/email"), "444@test.com");
        assert.equal(_.get(johnSnowBatch.body, "customerio/id"), "44444");
        assert.equal(Object.keys(johnSnowBatch.body).length, 5);

        done();
      });
    });
  });
});
