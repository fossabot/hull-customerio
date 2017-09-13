import nock from "nock";
import _ from "lodash";

module.exports = function mocks() {
  const API_PREFIX = "https://track.customer.io/api/v1";
  return {
    setUpIdentifyCustomerNock: (userId, email, attributes, callback) => nock(API_PREFIX)
      .put(`/customers/${userId}`, _.merge({
        email,
        created_at: /.*/
      }, attributes))
      .reply(200, () => {
        if (callback) {
          callback();
        }
        return undefined;
      }),
    setUpAlreadyIdentifiedCustomerNock: (userId, email, attributes) => nock(API_PREFIX)
      .put(`/customers/${userId}`, _.merge(attributes, {
        email
      }))
      .reply(200),
    setUpNextIdentifyBatchCusotomerNock: (userId, attributes) => nock(API_PREFIX)
      .put(`/customers/${userId}`, attributes)
      .reply(200),
    setUpDeleteCustomerNock: (userId, callback) => nock(API_PREFIX)
      .delete(`/customers/${userId}`)
      .reply(200, () => {
        if (callback) {
          callback();
        }
        return undefined;
      }),
    setUpSendAnonymousEventNock: (name, data) => nock(API_PREFIX)
      .post("/events", {
        name,
        data
      })
      .reply(200),
    setUpSendPageViewEventNock: (userId, name, data) => nock(API_PREFIX)
      .post(`/customers/${userId}/events`, {
        name,
        type: "page",
        data
      })
      .reply(200),
    setUpSendCustomerEventNock: (userId, name, data) => nock(API_PREFIX)
      .post(`/customers/${userId}/events`, {
        name,
        data
      })
      .reply(200),
    setUpCreateUserBadScenarioNock: (userId, email) => nock(API_PREFIX)
      .put(`/customers/${userId}`, {
        email,
        created_at: /.*/
      })
      .reply(500)
  };
};
