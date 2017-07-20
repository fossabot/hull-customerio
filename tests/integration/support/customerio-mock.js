import nock from "nock";

module.exports = function mocks() {
  return {
    setUpIdentifyCustomerNock: (userId) => nock("https://track.customer.io/api/v1")
      .put(`/customers/${userId}`)
      .reply(200)
  };
};
