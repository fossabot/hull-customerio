/* @flow */
const _ = require("lodash");
const superagent = require("superagent");
const { Client } = require("hull");
const SuperagentThrottle = require("superagent-throttle");

const { superagentUrlTemplatePlugin, superagentInstrumentationPlugin } = require("hull/lib/utils");

class CustomerioClient {
  urlPrefix: string;
  agent: superagent;
  auth: {
    username: string;
    password: string;
  };
  client: Client;

  constructor(ctx: Object) {
    const siteId = _.get(ctx.ship, "private_settings.site_id");
    const apiKey = _.get(ctx.ship, "private_settings.api_key");
    this.urlPrefix = "https://track.customer.io/api/v1";
    this.client = ctx.client;
    this.auth = {
      username: siteId,
      password: apiKey
    };

    const throttle = new SuperagentThrottle({
      rate: 30,          // how many requests can be sent every `ratePer`
      ratePer: 34000,   // number of ms in which `rate` requests may be sent
    });
    this.agent = superagent.agent()
      .use(throttle.plugin(siteId))
      .use(superagentUrlTemplatePlugin())
      .use(superagentInstrumentationPlugin({ logger: this.client.logger, metric: ctx.metric }))
      .set({ "Content-Type": "application/json" })
      .auth(siteId, apiKey)
      .ok(res => res.status === 200) // we reject the promise for all non 200 responses
      .timeout({ response: 10000 });
  }

  isConfigured() {
    return this.auth.username && this.auth.password;
  }

  checkAuth() {
    return this.agent.get("https://track.customer.io/auth");
  }

  identify(userId: string, attributes: Object) {
    return this.agent.put(`${this.urlPrefix}/customers/${userId}`).send(attributes);
  }

  deleteUser(userId: string) {
    return this.agent.delete(`${this.urlPrefix}/customers/${userId}`);
  }

  sendPageViewEvent(userId: string, page: string, eventData: Object) {
    return this.agent.post(`${this.urlPrefix}/customers/${userId}/events`)
      .send({
        type: "page",
        name: page,
        data: eventData
      });
  }

  sendCustomerEvent(userId: string, eventName: string, eventData: Object) {
    return this.agent.post(`${this.urlPrefix}/customers/${userId}/events`)
      .send({
        name: eventName,
        data: eventData
      });
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.agent.post(`${this.urlPrefix}/events`)
      .send({
        name: eventName,
        data: eventData
      });
  }
}

module.exports = CustomerioClient;
