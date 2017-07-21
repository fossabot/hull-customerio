import nock from "nock";
import _ from "lodash";

module.exports = function mocks() {
  const API_PREFIX = "https://track.customer.io/api/v1";
  return {
    setUpIdentifyCustomerNock: (userId, email, attributes) => nock(API_PREFIX)
      .put(`/customers/${userId}`, _.merge(attributes, {
        email,
        created_at: /.*/
      }))
      .reply(200),
    setUpAlreadyIdentifiedCustomerNock: (userId, email, attributes) => nock(API_PREFIX)
      .put(`/customers/${userId}`, _.merge(attributes, {
        email
      }))
      .reply(200),
    setUpDeleteCustomerNock: (userId) => nock(API_PREFIX)
      .delete(`/customers/${userId}`)
      .reply(200),
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
      .reply(200)
  };
};
