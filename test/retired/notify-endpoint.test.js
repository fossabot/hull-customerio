/* global describe, it, beforeEach, afterEach */
const Minihull = require("minihull");
const assert = require("assert");
const moment = require("moment");

const bootstrap = require("./helper/bootstrap");
const CustomerioMock = require("./helper/customerio-mock");

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

  beforeEach(function (done) { // eslint-disable-line func-names
    minihull = new Minihull();
    server = bootstrap();
    return minihull.listen(8001).then(() => {
      done();
    });
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  test("should send users to customer.io", function (done) { // eslint-disable-line func-names
    customerioMock.setUpIdentifyCustomerNock("34567", "foo@bar.com", {
      first_name: "James",
      last_name: "Bond",
      hull_segments: ["testSegment"]
    }, () => done());

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: {
        email: "foo@bar.com", test_id: "34567", first_name: "James", last_name: "Bond"
      },
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }], [{
      name: "testSegment",
      id: "hullSegmentId"
    }]);
  });

  test("should send events to customer.io", function (done) { // eslint-disable-line func-names
    const createCustomerNock = customerioMock.setUpIdentifyCustomerNock("54321", "foo@test.com", {
      first_name: "Katy",
      last_name: "Perry",
      hull_segments: ["testSegment"]
    });
    const pageViewEventsMock = customerioMock.setUpSendPageViewEventNock("54321", "http://www.google.com", {
      name: "Page Event",
      some_property: "test",
      url: "http://www.google.com"
    });
    const customerEventMock = customerioMock.setUpSendCustomerEventNock("54321", "custom", {
      name: "Custom Event"
    });

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: {
        email: "foo@test.com", test_id: "54321", first_name: "Katy", last_name: "Perry"
      },
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

  test("should not send user if he was already sent", function (done) { // eslint-disable-line func-names
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

  test("should delete user = require(customer.io if he does not match segments", function (done) { // eslint-disable-line func-names
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

  test("should send anonymous event to customer.io", function (done) { // eslint-disable-line func-names
    customerioMock.setUpSendAnonymousEventNock("anonymous", {
      name: "Anonymous Event"
    }, () => done());

    minihull.smartNotifyConnector({ id: "123456789012345678901235", private_settings }, "http://localhost:8000/smart-notifier", "user:update", [{
      user: {
        email: "foo@bar.com", anonymous_id: "999", first_name: "Eva", last_name: "Green"
      },
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

  test("should send only email, created_at and hull_segments attributes if synchronized_attributes does not contains other fields", function (done) { // eslint-disable-line func-names
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

  test("should handle customerio api failure and not return 500", function (done) { // eslint-disable-line func-names
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
  }, 3000);
});
