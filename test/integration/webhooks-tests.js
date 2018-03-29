/* global describe, it, beforeEach, afterEach */
const Minihull = require("minihull");
const assert = require("assert");
const superagent = require("superagent");

const bootstrap = require("./support/bootstrap");
const { encrypt } = require("../../server/lib/crypto");

describe("Connector for webhooks endpoint", function test() {
  let minihull;
  let server;

  const private_settings = {
    synchronized_segments: ["hullSegmentId"],
    anonymous_events: "sure, why not",
    user_id_mapping: "test_id",
    site_id: "1",
    api_key: "2",
    synchronized_attributes: [],
    events_filter: ["page", "custom", "anonymous"]
  };

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

  const config = {
    organization: "localhost:8001",
    ship: "123456789012345678901234",
    secret: "1234"
  };
  const token = encrypt(config, "1234");

  it("should track email events in correct form", done => {
    superagent.post(`http://localhost:8000/webhook?conf=${token}`)
      .send({
        data: {
          campaign_id: "1",
          customer_id: "example_customer",
          email_address: "example@customer.io",
          email_id: "example_email",
          subject: "Example Email",
          template_id: "2",
          campaign_name: "My Christmas campaign"
        },
        event_id: "abcd123",
        event_type: "email_sent",
        timestamp: 1500635446
      }).then();

    minihull.on("incoming.request", req => {
      const { batch } = req.body;
      if (batch) {
        const { type, body } = batch[0];

        assert.equal(type, "track");
        assert.equal(body.properties.email_id, "example_email");
        assert.equal(body.properties.campaign_id, "1");
        assert.equal(body.properties.campaign_name, "My Christmas campaign");
        assert.equal(body.properties.customer_id, "example_customer");
        assert.equal(body.properties.email_subject, "Example Email");
        assert.equal(body.properties.template_id, "2");
        assert.equal(body.properties.email_address, "example@customer.io");
        assert.equal(body.event_id, "abcd123");
        assert.equal(body.created_at, 1500635446);
        assert.equal(body.event, "Email Sent");

        done();
      }
    });
  });

  it("should not track events if event_type is undefined on our side", done => {
    superagent.post(`http://localhost:8000/webhook?conf=${token}`)
      .send({
        data: {
          campaign_id: "1",
          customer_id: "example_customer",
          email_address: "example@customer.io",
          email_id: "example_email",
          subject: "Example Email",
          template_id: "2"
        },
        event_id: "abcd123",
        event_type: "email_that_we_did_not_specified",
        timestamp: 1500635446
      }).then();

    minihull.on("incoming.request", req => {
      const { batch } = req.body;
      if (batch) {
        done("track events should not happen !");
      }
    });

    setTimeout(() => {
      done();
    }, 1500);
  });

  it("should not track events if customerio sent test event", done => {
    superagent.post(`http://localhost:8000/webhook?conf=${token}`)
      .send({
        data: {
          campaign_id: "1",
          customer_id: "example_customer",
          email_address: "example@customer.io",
          email_id: "example_email",
          subject: "Example Email",
          template_id: "2"
        },
        event_id: "abc123",
        event_type: "email_that_we_did_not_specified",
        timestamp: 1500635446
      }).then();

    minihull.on("incoming.request", req => {
      const { batch } = req.body;
      if (batch) {
        done("track events should not happen !");
      }
    });

    setTimeout(() => {
      done();
    }, 1500);
  });
});
