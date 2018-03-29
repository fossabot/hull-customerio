const Minihull = require("minihull");
const _ = require("lodash");
const bootstrap = require("./helper/bootstrap");
const CustomerioMock = require("./helper/customerio-mock");

describe.only("Connector should respect API limits", function test() {
  let minihull;
  let server;
  const customerioMock = new CustomerioMock();

  const private_settings = {
    synchronized_segments: ["hullSegmentId"],
    user_id_mapping: "test_id",
    site_id: "1",
    api_key: "2"
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
    done();
  });

  afterEach(() => {
    minihull.close();
    server.close();
  });

  test.only("should send attributes in 30 count batches", function (done) { // eslint-disable-line func-names
    const range = _.range(35);

    const hullUserIdent = { email: "333@test.com" };
    const hullUserFields = _.zipObject(range.map(i => `field_${i}`), range);

    private_settings.synchronized_attributes = Object.keys(hullUserFields);

    const firstBatchNock = customerioMock.setUpIdentifyCustomerNock(
      "33333", "333@test.com",
      _.pickBy(hullUserFields, v => v < 28)
    );
    const secondBatchNock = customerioMock.setUpNextIdentifyBatchCustomerNock("33333", _.merge({ hull_segments: ["testSegment"] }, _.pickBy(hullUserFields, v => v >= 28)));

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: _.merge({ test_id: "33333" }, hullUserIdent, hullUserFields),
      changes: {},
      events: [],
      segments: [{ id: "hullSegmentId", name: "testSegment" }]
    }).then(() => {
      setTimeout(() => {
        firstBatchNock.done();
        secondBatchNock.done();
        done();
      }, 1000);
    });
  });
});
