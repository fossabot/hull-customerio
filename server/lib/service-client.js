/* @flow */
import type { IServiceClientOptions, IServiceCredentials, ILogger, IMetricsClient, ICustomerIoEvent, ICustomerIoCustomer } from "./types";

const _ = require("lodash");
const superagent = require("superagent");
const SuperagentThrottle = require("superagent-throttle");
const prefixPlugin = require("superagent-prefix");

const { superagentUrlTemplatePlugin, superagentInstrumentationPlugin } = require("hull/lib/utils");

class ServiceClient {
  /**
   * Gets or sets the url prefix for all API calls.
   *
   * @type {string}
   * @memberof ServiceClient
   */
  urlPrefix: string;

  /**
   * Gets or sets the instance of superagent to use for API calls.
   *
   * @type {superagent}
   * @memberof ServiceClient
   */
  agent: superagent;

  /**
   * Gets or sets the credentials to authenticate with customer.io.
   *
   * @type {IServiceCredentials}
   * @memberof ServiceClient
   */
  auth: IServiceCredentials;

  /**
   * Gets or sets the logging client to use.
   *
   * @type {ILogger}
   * @memberof ServiceClient
   */
  logger: ILogger;

  /**
   * Gets or sets the client to report metrics.
   *
   * @type {IMetricsClient}
   * @memberof ServiceClient
   */
  metricsClient: IMetricsClient;

  /**
   * Creates an instance of ServiceClient.
   * @param {IServiceClientOptions} options The options to configure the client with.
   * @memberof ServiceClient
   */
  constructor(options: IServiceClientOptions) {
    this.urlPrefix = options.baseApiUrl;
    this.auth = options.credentials;
    this.logger = options.logger;
    this.metricsClient = options.metricsClient;

    const throttle = new SuperagentThrottle({
      rate: 30, // how many requests can be sent every `ratePer`
      ratePer: 34000, // number of ms in which `rate` requests may be sent
    });

    this.agent = superagent.agent()
      .use(prefixPlugin(this.urlPrefix))
      .use(throttle.plugin(this.auth.username))
      .use(superagentUrlTemplatePlugin())
      .use(superagentInstrumentationPlugin({ logger: this.logger, metric: this.metricsClient }))
      .set({ "Content-Type": "application/json" })
      .auth(this.auth.username, this.auth.password)
      .ok(res => res.status === 200) // we reject the promise for all non 200 responses
      .timeout({ response: 10000 });
  }

  /**
   * Checks whether the provided credentials are valid or not.
   *
   * @returns {Promise<boolean>} 
   * @memberof ServiceClient
   */
  checkValidCredentials(): Promise<boolean> {
    return this.agent.get("/auth").then(() => {
      return true;
    }).catch((err) => {
      if(_.get(err, "response.status") === 401) {
        return false;
      }
      throw err;
    });
  }

  /**
   * Creates or updates a customer.
   * 
   * @param {ICustomerIoCustomer} customer The customer data.
   * @returns {Promise<ICustomerIoCustomer>} A promise which resolves the customer if operation succeeded.
   * @memberof ServiceClient
   */
  updateCustomer(customer: ICustomerIoCustomer): Promise<ICustomerIoCustomer> {
    const attributes = _.omit(customer, "id");
    const id = _.get(customer, "id");
    return this.agent.put("/api/v1/customers/{{id}}").tmplVar({ id }).send(attributes).then(() => {
      return customer;
    });
  }

  /**
   * Deletes a customer.
   *
   * @param {string} id The identifier of the customer to delete.
   * @returns {Promise<string>} A promise which resolves to the identifier if operation succeeded.
   * @memberof ServiceClient
   */
  deleteCustomer(id: string): Promise<string> {
    return this.agent.delete("/api/v1/customers/{{id}}").tmplVar({ id }).then(() => {
      return id;
    });
  }

  /**
   * Sends an event tracked for a particular user.
   *
   * @param {string} id The identifier of the user.
   * @param {ICustomerIoEvent} event The event data.
   * @returns {Promise<ICustomerIoEvent>} A promise which resolves to the event data if operation succeeded.
   * @memberof ServiceClient
   */
  sendEvent(id: string, event: ICustomerIoEvent): Promise<ICustomerIoEvent> {
    return this.agent.post("/api/v1/customers/{{id}}/events")
      .tmplVar({ id })
      .send(event)
      .then(() => {
        return event;
      });
  }

  /**
   * Sends an anonymous event.
   *
   * @param {ICustomerIoEvent} event The event data.
   * @returns {Promise<ICustomerIoEvent>} A promise which resolves to the event data if operation succeeded.
   * @memberof ServiceClient
   */
  sendAnonymousEvent(event: ICustomerIoEvent): Promise<ICustomerIoEvent> {
    return this.agent.post("/api/v1/customers/events")
      .send(event)
      .then(() => {
        return event;
      });
  }
}

module.exports = ServiceClient;
