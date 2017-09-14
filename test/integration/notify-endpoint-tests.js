/* global describe, it, beforeEach, afterEach */
import Minihull from "minihull";
import assert from "assert";
import moment from "moment";

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

  beforeEach(done => {
    minihull = new Minihull();
    server = bootstrap();
    minihull.listen(8001);

    setTimeout(() => {
      done();
    }, 1000);
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  it("should send users to customer.io", done => {
    customerioMock.setUpIdentifyCustomerNock("34567", "foo@bar.com", {
      first_name: "James",
      last_name: "Bond",
      hull_segments: ["testSegment"]
    }, () => done());

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: { email: "foo@bar.com", test_id: "34567", first_name: "James", last_name: "Bond" },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]);
  });

  it("should send events to customer.io", done => {
    const createCustomerNock = customerioMock.setUpIdentifyCustomerNock("54321", "foo@test.com", {
      first_name: "Katy",
      last_name: "Perry",
      hull_segments: ["testSegment"]
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

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
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
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]);

    setTimeout(() => {
      createCustomerNock.done();
      customerEventMock.done();
      pageViewEventsMock.done();
      done();
    }, 1500);
  });

  it("should not send user if he was already sent", done => {
    customerioMock.setUpAlreadyIdentifiedCustomerNock("66666", "foo@bar.com", {
      first_name: "Olivia",
      last_name: "Wilde"
    });

    minihull.on("incoming.request", () => {
      done(Error("incoming request should not happen !"));
    });

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: {
        email: "foo@bar.com",
        test_id: "66666",
        first_name: "Olivia",
        last_name: "Wilde",
        "traits_customerio/created_at": "66666"
      },
      changes: {
        user: {
          "traits_customerio/id": [null, "66666"]
        }
      },
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]);

    setTimeout(() => {
      done();
    }, 1500);
  });

  it("should delete user from customer.io if he does not match segments", done => {
    const deleteUserNock = customerioMock.setUpDeleteCustomerNock("77777");

    minihull.on("incoming.request", () => {
      deleteUserNock.done();
      done();
    });

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: {
        email: "foo@bar.com",
        test_id: "77777",
        first_name: "James",
        last_name: "Bond",
        "traits_customerio/created_at": moment().format()
      },
      changes: {},
      events: [],
      segments: []
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]);
  });

  it("should send anonymous event to customer.io", done => {
    customerioMock.setUpSendAnonymousEventNock("anonymous", {
      event: "anonymous",
      context: {
        some_field: "testing"
      },
      properties: {
        name: "Anonymous Event"
      }
    }, () => done());

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
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
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]);
  });

  it("should send only email, created_at and hull_segments attributes if synchronized_attributes does not contains other fields", done => {
    customerioMock.setUpIdentifyCustomerNock("34567", "foo@test2.com", { hull_segments: ["testSegment"] }, () => done());

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: { email: "foo@test2.com", test_id: "34567", testAttribute: "test" },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]);
  });

  it("should handle customerio api failure and not return 500", done => {
    const badScenarioNock = customerioMock.setUpDeleteUserBadScenarioNock("34567", "foo@test2.com", {});
    let request;

    minihull.on("outgoing.request", req => {
      request = req;
    });

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: { email: "foo@test2.com", test_id: "34567", testAttribute: "test" },
      changes: {},
      events: [],
      segments: []
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]).then(() => {
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
