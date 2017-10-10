/* @flow */
import axios from "axios";
import Bottleneck from "bottleneck";
import { Client } from "hull";

export default class CustomerioClient {
  urlPrefix: string;
  auth: {
    username: string;
    password: string;
  };
  bottleneck: Bottleneck;
  client: Client;

  constructor(siteId: string, apiKey: string, bottleneck: Bottleneck, client: Client) {
    this.urlPrefix = "https://track.customer.io/api/v1";
    this.auth = {
      username: siteId,
      password: apiKey
    };
    this.bottleneck = bottleneck;
    this.client = client;
  }

  isConfigured() {
    return this.auth.username && this.auth.password;
  }

  checkAuth() {
    return this.request("https://track.customer.io/auth", "get");
  }

  identify(userId: string, attributes: Object) {
    return this.bottleneck.schedule(this.request.bind(this), `${this.urlPrefix}/customers/${userId}`, "put", attributes);
  }

  deleteUser(userId: string) {
    return this.bottleneck.schedule(this.request.bind(this), `${this.urlPrefix}/customers/${userId}`, "delete");
  }

  sendPageViewEvent(userId: string, page: string, eventData: Object) {
    return this.bottleneck.schedule(this.request.bind(this), `${this.urlPrefix}/customers/${userId}/events`, "post", {
      type: "page",
      name: page,
      data: eventData
    });
  }

  sendCustomerEvent(userId: string, eventName: string, eventData: Object) {
    return this.bottleneck.schedule(this.request.bind(this), `${this.urlPrefix}/customers/${userId}/events`, "post", {
      name: eventName,
      data: eventData
    });
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.bottleneck.schedule(this.request.bind(this), `${this.urlPrefix}/events`, "post", {
      name: eventName,
      data: eventData
    });
  }

  request(url: string, method: string, data: Object = {}) {
    this.client.logger.debug("customerioClient.request", { method, url });
    return axios({
      method,
      url,
      withCredentials: true,
      auth: this.auth,
      headers: {
        "Content-Type": "application/json"
      },
      data
    }).then(res => {
      const status = res.status;
      if (status !== 200) throw new Error(`Unhandled status code: ${status}`);
      return res;
    });
  }
}
