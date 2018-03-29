/* global describe, it, beforeEach, afterEach */

const Minihull = require("minihull");
const moment = require("moment");

const bootstrap = require("./helper/bootstrap");
const CustomerioMock = require("./helper/customerio-mock");

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
    events_filter: ["page", "custom", "anonymous"],
    enable_user_deletion: "true",
  };

  beforeEach(function (done) { // eslint-disable-line func-names
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

  test("should send batch of users to customer.io", function (done) { // eslint-disable-line func-names
    const jamesVeitchCustomerNock = customerioMock.setUpIdentifyCustomerNock("22222", "222@test.com", {
      first_name: "James",
      last_name: "Veitch",
      hull_segments: ["testSegment"]
    });

    const johnSnowCustomerNock = customerioMock.setUpIdentifyCustomerNock("44444", "444@test.com", {
      first_name: "John",
      last_name: "Snow",
      hull_segments: ["testSegment"]
    });

    minihull.stubBatch([{
      email: "222@test.com",
      id: "22222",
      external_id: "1",
      anonymous_id: "2",
      first_name: "James",
      last_name: "Veitch",
      segment_ids: ["hullSegmentId"]
    }, {
      email: "444@test.com",
      id: "44444",
      external_id: "3",
      anonymous_id: "4",
      first_name: "John",
      last_name: "Snow",
      segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      setTimeout(() => {
        jamesVeitchCustomerNock.done();
        johnSnowCustomerNock.done();
        done();
      }, 500);
    });
  });

  test("should not delete user if he was never sent to customer.io", function (done) { // eslint-disable-line func-names
    const deleteNock = customerioMock.setUpDeleteCustomerNock("44444");

    minihull.stubBatch([{
      email: "444@test.com",
      id: "44444",
      external_id: "1",
      anonymous_id: "2",
      first_name: "John",
      last_name: "Snow",
      segment_ids: []
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      minihull.on("incoming.request", () => {
        if (deleteNock.isDone()) {
          done(Error("Unexpected request"));
        }
      });

      setTimeout(() => {
        done();
      }, 1000);
    });
  });

  test("should send batch of users to customer.io and delete users that do not match filtered segments", function (done) { // eslint-disable-line func-names
    const firstCustomerCreateNock = customerioMock.setUpIdentifyCustomerNock("22222", "222@test.com", {
      first_name: "James",
      last_name: "First",
      hull_segments: ["testSegment"]
    });

    const secondCustomerDeleteNock = customerioMock.setUpDeleteCustomerNock("55555");

    minihull.stubBatch([{
      email: "222@test.com",
      id: "22222",
      external_id: "1",
      anonymous_id: "2",
      first_name: "James",
      last_name: "First",
      segment_ids: ["hullSegmentId"]
    }, {
      email: "444@test.com",
      id: "55555",
      external_id: "3",
      anonymous_id: "4",
      first_name: "John",
      last_name: "Second",
      segment_ids: [],
      "traits_customerio/created_at": moment().format()
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      setTimeout(() => {
        firstCustomerCreateNock.done();
        secondCustomerDeleteNock.done();
        done();
      }, 1500);
    });
  });
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
    events_filter: ["page", "custom", "anonymous"]
  };

  beforeEach(() => {
    minihull = new Minihull();
    server = bootstrap();
    minihull.listen(8001);
    minihull.stubConnector({ id: "123456789012345678901234", private_settings });
    minihull.stubSegments([{
      name: "testSegment",
      id: "hullSegmentId"
    }]);

    setTimeout(() => {
      return Promise.resolve();
    }, 1000);
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  test("should send batch of users to customer.io", function (done) { // eslint-disable-line func-names
    const jamesVeitchCustomerNock = customerioMock.setUpIdentifyCustomerNock("22222", "222@test.com", {
      first_name: "James",
      last_name: "Veitch",
      hull_segments: ["testSegment"]
    });

    const johnSnowCustomerNock = customerioMock.setUpIdentifyCustomerNock("44444", "444@test.com", {
      first_name: "John",
      last_name: "Snow",
      hull_segments: ["testSegment"]
    });

    minihull.stubBatch([{
      email: "222@test.com",
      id: "22222",
      external_id: "1",
      anonymous_id: "2",
      first_name: "James",
      last_name: "Veitch",
      segment_ids: ["hullSegmentId"]
    }, {
      email: "444@test.com",
      id: "44444",
      external_id: "3",
      anonymous_id: "4",
      first_name: "John",
      last_name: "Snow",
      segment_ids: ["hullSegmentId"]
    }]);

    minihull.batchConnector("123456789012345678901234", "http://localhost:8000/batch").then(() => {
      setTimeout(() => {
        jamesVeitchCustomerNock.done();
        johnSnowCustomerNock.done();
        done();
      }, 1500);
    });
  });
});
