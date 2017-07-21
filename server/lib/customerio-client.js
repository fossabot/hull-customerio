/* @flow */
import axios from "axios";

export default class CustomerioClient {
  urlPrefix: string;
  auth: {
    username: string;
    password: string;
  };

  constructor(siteId: string, apiKey: string) {
    this.urlPrefix = "https://track.customer.io/api/v1";
    this.auth = {
      username: siteId,
      password: apiKey
    };
  }

  isConfigured() {
    return this.auth.username && this.auth.password;
  }

  identify(userId: string, attributes: Object) {
    return this.request(`${this.urlPrefix}/customers/${userId}`, "put", attributes);
  }

  deleteUser(userId: string) {
    return this.request(`${this.urlPrefix}/customers/${userId}`, "delete");
  }

  sendPageViewEvent(userId: string, page: string, eventData: Object) {
    return this.request(`${this.urlPrefix}/customers/${userId}/events`, "post", {
      type: "page",
      name: page,
      data: eventData
    });
  }

  sendCustomerEvent(userId: string, eventName: string, eventData: Object) {
    return this.request(`${this.urlPrefix}/customers/${userId}/events`, "post", {
      name: eventName,
      data: eventData
    });
  }

  sendAnonymousEvent(eventName: string, eventData: Object) {
    return this.request(`${this.urlPrefix}/events`, "post", {
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
    });
  }

}
