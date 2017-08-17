/* global describe, it, beforeEach, afterEach */

import Minihull from "minihull";
import assert from "assert";
import _ from "lodash";
import bootstrap from "./support/bootstrap";
import CustomerioMock from "./support/customerio-mock";

describe("Connector for notify endpoint", function test() {
  let minihull;
  let server;
  const customerioMock = new CustomerioMock();

  const private_settings = {
    synchronized_segments: ["hullSegmentId"],
    anonymous_events: "true",
    user_id_mapping: "test_id",
    site_id: "1",
    api_key: "2",
    synchronized_attributes: ["first_name", "last_name"],
    events_filter: ["page", "custom", "anonymous"],
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

  it("should send users to customer.io", (done) => {
    const createCustomerNock = customerioMock.setUpIdentifyCustomerNock("34567", "foo@bar.com", {
      first_name: "James",
      last_name: "Bond",
      hull_segments: "testSegment"
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: { email: "foo@bar.com", test_id: "34567", first_name: "James", last_name: "Bond" },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      minihull.on("incoming.request", (req) => {
        createCustomerNock.done();
        const { type, body } = req.body.batch[0];

        assert.equal(type, "traits");
        assert.equal(_.get(body, "customerio/first_name"), "James");
        assert.equal(_.get(body, "customerio/last_name"), "Bond");
        assert(_.get(body, "customerio/created_at"));
        assert.equal(_.get(body, "customerio/email"), "foo@bar.com");
        assert.equal(_.get(body, "customerio/id"), "34567");
        assert.equal(Object.keys(body).length, 5);

        done();
      });
    });
  });

  it("should send events to customer.io", (done) => {
    const createCustomerNock = customerioMock.setUpIdentifyCustomerNock("54321", "foo@test.com", {
      first_name: "Katy",
      last_name: "Perry",
      hull_segments: "testSegment"
    });
    const pageViewEventsMock = customerioMock.setUpSendPageViewEventNock("54321", "http://www.google.com", {
      context: {
        page: "http://www.google.com"
      },
      properties: {
        name: "Page Event",
        some_property: "test",
        url: "http://www.google.com"
      },
      event: "page"
    });
    const customerEventMock = customerioMock.setUpSendCustomerEventNock("54321", "custom", {
      event: "custom",
      context: {
        context_property: "testify"
      },
      properties: {
        name: "Custom Event"
      }
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: { email: "foo@test.com", test_id: "54321", first_name: "Katy", last_name: "Perry" },
      changes: {},
      events: [{
        event: "page",
        context: {
          page: "http://www.google.com"
        },
        properties: {
          name: "Page Event",
          some_property: "test",
          url: "http://www.google.com"
        }
      }, {
        event: "custom",
        context: {
          context_property: "testify"
        },
        properties: {
          name: "Custom Event"
        }
      }],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      minihull.on("incoming.request", (req) => {
        createCustomerNock.done();
        pageViewEventsMock.done();
        customerEventMock.done();
        const { body, type } = req.body.batch[0];

        assert.equal(type, "traits");
        assert.equal(_.get(body, "customerio/first_name"), "Katy");
        assert.equal(_.get(body, "customerio/last_name"), "Perry");
        assert(_.get(body, "customerio/created_at"));
        assert.equal(_.get(body, "customerio/email"), "foo@test.com");
        assert.equal(_.get(body, "customerio/id"), "54321");
        assert.equal(Object.keys(body).length, 5);

        done();
      });
    });
  });

  it("should not send user if he was already sent", (done) => {
    customerioMock.setUpAlreadyIdentifiedCustomerNock("66666", "foo@bar.com", {
      first_name: "Olivia",
      last_name: "Wilde"
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: {
        email: "foo@bar.com",
        test_id: "66666",
        first_name: "Olivia",
        last_name: "Wilde",
        "traits_customerio/id": "66666"
      },
      changes: {
        user: {
          "traits_customerio/id": [null, "66666"]
        }
      },
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      minihull.on("incoming.request", () => {
        done(Error("incoming request should not happen !"));
      });
    });

    setTimeout(() => {
      done();
    }, 1500);
  });

  it("should delete user from customer.io if he does not match segments", (done) => {
    const deleteUserNock = customerioMock.setUpDeleteCustomerNock("77777");

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: {
        email: "foo@bar.com",
        test_id: "77777",
        first_name: "James",
        last_name: "Bond",
        "traits_customerio/id": 77777
      },
      changes: {},
      events: [],
      segments: []
    }).then(() => {
      minihull.on("incoming.request", () => {
        deleteUserNock.done();
        done();
      });
    });
  });

  it("should send anonymous event to customer.io", (done) => {
    const anonymousEventNock = customerioMock.setUpSendAnonymousEventNock("anonymous", {
      event: "anonymous",
      context: {
        some_field: "testing"
      },
      properties: {
        name: "Anonymous Event"
      }
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: { email: "foo@bar.com", anonymous_id: "999", first_name: "Eva", last_name: "Green" },
      changes: {},
      events: [{
        event: "anonymous",
        context: {
          some_field: "testing"
        },
        properties: {
          name: "Anonymous Event"
        }
      }],
      segments: []
    }).then(() => {
      setTimeout(() => {
        anonymousEventNock.done();
        done();
      }, 1500);
    });
  });

  it("should send only email and created_at attributes if synchronized_attributes does not contains other fields", (done) => {
    const createCustomerNock = customerioMock.setUpIdentifyCustomerNock("34567", "foo@test2.com", { hull_segments: "testSegment" });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: { email: "foo@test2.com", test_id: "34567", testAttribute: "test" },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      minihull.on("incoming.request", (req) => {
        createCustomerNock.done();
        const { body, type } = req.body.batch[0];

        assert.equal(type, "traits");
        assert.equal(_.get(body, "customerio/email"), "foo@test2.com");
        assert(_.get(body, "customerio/created_at"));
        assert.equal(_.get(body, "customerio/id"), "34567");
        assert.equal(Object.keys(body).length, 3);

        done();
      });
    });
  });

  it("should handle customerio api failure and not return 500", (done) => {
    const badScenarioNock = customerioMock.setUpCreateUserBadScenarioNock("34567", "foo@test2.com", {});
    let request;

    minihull.on("outgoing.request", (req) => {
      request = req;
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: { email: "foo@test2.com", test_id: "34567", testAttribute: "test" },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      setTimeout(() => {
        if (!request) {
          done(Error("expected request but got nothing"));
        }
        badScenarioNock.done();

        assert(request.response.ok);
        assert.equal(request.response.status, 200);
        assert(!request.response.serverError);

        done();
      }, 2500);
    });
  }).timeout(3000);
});
