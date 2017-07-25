/* @flow */
import axios from "axios";
import Bottleneck from "bottleneck";

export default class CustomerioClient {
  urlPrefix: string;
  auth: {
    username: string;
    password: string;
  };
  bottleneck: Bottleneck;

  constructor(siteId: string, apiKey: string, bottleneck: Bottleneck) {
    this.urlPrefix = "https://track.customer.io/api/v1";
    this.auth = {
      username: siteId,
      password: apiKey
    };
    this.bottleneck = bottleneck;
  }

  isConfigured() {
    return this.auth.username && this.auth.password;
  }

  identify(userId: string, attributes: Object) {
    return this.bottleneck.schedule(this.request, `${this.urlPrefix}/customers/${userId}`, "put", attributes);
  }

  deleteUser(userId: string) {
    return this.bottleneck.schedule(this.request, `${this.urlPrefix}/customers/${userId}`, "delete");
  }

  sendPageViewEvent(userId: string, page: string, eventData: Object) {
    return this.bottleneck.schedule(this.request, `${this.urlPrefix}/customers/${userId}/events`, "post", {
      type: "page",
      name: page,
      data: eventData
    });
  }

  sendCustomerEvent(userId: string, eventName: string, eventData: Object) {
    return this.bottleneck.schedule(this.request, `${this.urlPrefix}/customers/${userId}/events`, "post", {
      name: eventName,
      data: eventData
    });
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.bottleneck.schedule(this.request, `${this.urlPrefix}/events`, "post", {
      name: eventName,
      data: eventData
    });
  }

  request(url: string, method: string, data: Object = {}) {
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
