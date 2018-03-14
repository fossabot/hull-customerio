/* @flow */
import type { TReqContext } from "hull";
import type { IServiceCredentials } from "./types";

const _ = require("lodash");
const superagent = require("superagent");
const { Client } = require("hull");
const SuperagentThrottle = require("superagent-throttle");
const prefixPlugin = require("superagent-prefix");

const { superagentUrlTemplatePlugin, superagentInstrumentationPlugin } = require("hull/lib/utils");

class CustomerioClient {
  /**
   * Gets or sets the url prefix for all API calls.
   *
   * @type {string}
   * @memberof CustomerioClient
   */
  urlPrefix: string;

  /**
   * Gets or sets the instance of superagent to use for API calls.
   *
   * @type {superagent}
   * @memberof CustomerioClient
   */
  agent: superagent;

  /**
   * Gets or sets the credentials to authenticate with customer.io.
   *
   * @type {IServiceCredentials}
   * @memberof CustomerioClient
   */
  auth: IServiceCredentials;
  client: Client;

  constructor(ctx: TReqContext) {
    const { metric } = ctx;
    const siteId = _.get(ctx.ship, "private_settings.site_id", "n/a");
    const apiKey = _.get(ctx.ship, "private_settings.api_key", "n/a");
    this.urlPrefix = "https://track.customer.io";
    this.client = ctx.client;
    this.auth = {
      username: siteId,
      password: apiKey
    };

    const throttle = new SuperagentThrottle({
      rate: 30, // how many requests can be sent every `ratePer`
      ratePer: 34000, // number of ms in which `rate` requests may be sent
    });

    this.agent = superagent.agent()
      .use(prefixPlugin(this.urlPrefix))
      .use(throttle.plugin(siteId))
      .use(superagentUrlTemplatePlugin())
      .use(superagentInstrumentationPlugin({ logger: this.client.logger, metric }))
      .set({ "Content-Type": "application/json" })
      .auth(siteId, apiKey)
      .ok(res => res.status === 200) // we reject the promise for all non 200 responses
      .timeout({ response: 10000 });
  }

  /**
   * Checks whether the client is basically configured
   * and could potentially make calls against the API.
   *
   * @returns {boolean} True if username and password are present; otherwise false.
   * @memberof CustomerioClient
   */
  isConfigured(): boolean {
    const hasUsername: boolean = (this.auth.username !== "n/a");
    const hasPassword: boolean = (this.auth.password !== "n/a");
    return hasUsername && hasPassword;
  }

  /**
   * Performs a call against the API to check the authorization
   * and returns the response.
   *
   * @returns {*} The response from the API.
   * @memberof CustomerioClient
   */
  checkAuth(): Promise<*> {
    return this.agent.get("/auth");
  }

  /**
   * Performs a call against the API to update a customer.
   *
   * @param {string} userId The unique identifier for the customer
   * @param {Object} attributes Custom attributes to define the customer
   * @returns { Promise<any> } The response from the customer.io API.
   * @memberof CustomerioClient
   */
  identify(userId: string, attributes: Object): Promise<*> {
    return this.agent.put("/api/v1/customers/{{userId}}").tmplVar({ userId }).send(attributes);
  }

  /**
   * Performs a call against the API to delete a customer.
   *
   * @param {string} userId The unique identifier for the customer
   * @returns { Promise<any> } The response from the customer.io API.
   * @memberof CustomerioClient
   */
  deleteUser(userId: string): Promise<*> {
    return this.agent.delete("/api/v1/customers/{{userId}}").tmplVar({ userId });
  }

  /**
   * Performs a call against the API to send a page view event.
   *
   * @param {string} userId The unique identifier for the customer
   * @param {string} name The name of the page to track
   * @param {Object} data Custom data to include with the page view
   * @returns { Response } The response from the customer.io API.
   * @memberof CustomerioClient
   */
  sendPageViewEvent(userId: string, name: string, data: any): Promise<*> {
    return this.agent.post("/api/v1/customers/{{userId}}/events")
      .tmplVar({ userId })
      .send({ type: "page", name, data });
  }

  /**
   * Performs a call against the API to send an event to Customer.io
   * outside of the browser.
   *
   * @param {string} userId The unique identifier for the customer
   * @param {string} name The name of the event to track
   * @param {Object} data Custom data to include with the event
   * @returns { Response } The response from the customer.io API.
   * @memberof CustomerioClient
   */
  sendCustomerEvent(userId: string, name: string, data: Object): Promise<*> {
    return this.agent.post("/api/v1/customers/{{userId}}/events")
      .tmplVar({ userId })
      .send({ name, data });
  }

  /**
   * Performs a call against the API to send anonymous events without
   * a customer ID.
   *
   * @param {string} name The name of the event to track
   * @param {Object} data Custom data to include with the event
   * @returns {Response} The response from the customer.io API.
   * @memberof CustomerioClient
   */
  sendAnonymousEvent(name: string, data: Object): Promise<*> {
    return this.agent.post("/api/v1/events")
      .send({ name, data });
  }
}

module.exports = CustomerioClient;
