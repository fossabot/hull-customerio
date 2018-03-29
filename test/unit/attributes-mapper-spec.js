/* global describe, it */

const AttributesMapper = require("../../server/lib/attributes-mapper");
const assert = require("assert");
const moment = require("moment");

describe("AttributesMapper", () => {
  it("should clear nested account attributes from mappings", () => {
    const attribMappings = [
      "account.clearbit/name",
      "traits_salesforce_lead/title",
      "first_name",
      "last_name",
      "account.clearbit/geo_state"
    ];

    const cleanedMappings = [
      "account_clearbit/name",
      "traits_salesforce_lead/title",
      "first_name",
      "last_name",
      "account_clearbit/geo_state"
    ];

    const mapper = new AttributesMapper(attribMappings);
    mapper.clearAccountsMapping();

    assert.deepEqual(mapper.userAttributesMapping, cleanedMappings);
  });

  it("should map attributes including nested account attributes to a flat hierarchy with / replaced by -", () => {
    const attribMappings = [
      "account.clearbit/name",
      "traits_salesforce_lead/title",
      "first_name",
      "last_name",
      "account.clearbit/geo_state"
    ];

    const user = {
      account: {
        "clearbit/name": "Hull Inc",
        "clearbit/geo_state": "Georgia"
      },
      first_name: "Thomas",
      last_name: "Bass",
      "traits_salesforce_lead/title": "Customer Success"
    };

    const mappedAttribs = {
      "account_clearbit-name": "Hull Inc",
      "salesforce_lead-title": "Customer Success",
      first_name: "Thomas",
      last_name: "Bass",
      "account_clearbit-geo_state": "Georgia",
      created_at: "1360013296",
      email: "tb@hull.io"
    };

    const mapper = new AttributesMapper(attribMappings);
    const result = mapper.mapAttributesForService(user, "1360013296", "tb@hull.io");

    assert.deepEqual(result, mappedAttribs);
  });

  it("should map attributes without an account", () => {
    const attribMappings = [
      "traits_salesforce_lead/title",
      "first_name",
      "last_name"
    ];

    const user = {
      account: {
        "clearbit/name": "Hull Inc",
        "clearbit/geo_state": "Georgia"
      },
      first_name: "Thomas",
      last_name: "Bass",
      "traits_salesforce_lead/title": "Customer Success"
    };

    const mappedAttribs = {
      "salesforce_lead-title": "Customer Success",
      first_name: "Thomas",
      last_name: "Bass",
      created_at: "1360013296",
      email: "tb@hull.io"
    };

    const mapper = new AttributesMapper(attribMappings);
    const result = mapper.mapAttributesForService(user, "1360013296", "tb@hull.io");

    assert.deepEqual(result, mappedAttribs);
  });

  it("should map hull_segments by default", () => {
    const attribMappings = [
      "traits_salesforce_lead/title",
      "first_name",
      "last_name"
    ];

    const user = {
      account: {
        "clearbit/name": "Hull Inc",
        "clearbit/geo_state": "Georgia"
      },
      first_name: "Thomas",
      last_name: "Bass",
      "traits_salesforce_lead/title": "Customer Success",
      hull_segments: ["Foo", "Bar"]
    };

    const mappedAttribs = {
      "salesforce_lead-title": "Customer Success",
      first_name: "Thomas",
      last_name: "Bass",
      created_at: "1360013296",
      email: "tb@hull.io",
      hull_segments: ["Foo", "Bar"]
    };

    const mapper = new AttributesMapper(attribMappings);
    const result = mapper.mapAttributesForService(user, "1360013296", "tb@hull.io");

    assert.deepEqual(result, mappedAttribs);
  });

  it.only("should allow to map account name", () => {
    const attribMappings = [
      "email",
      "first_name",
      "last_name",
      "account.name"
    ];

    const user = {
      account: {
        name: "Hull Inc",
      },
      first_name: "Thomas",
      last_name: "Bass",
      email: "tb@hull.io",
      hull_segments: ["Foo", "Bar"]
    };

    const mappedAttribs = {
      account_name: "Hull Inc",
      first_name: "Thomas",
      last_name: "Bass",
      created_at: "1360013296",
      email: "tb@hull.io",
      hull_segments: ["Foo", "Bar"]
    };

    const mapper = new AttributesMapper(attribMappings);
    const result = mapper.mapAttributesForService(user, "1360013296", "tb@hull.io");

    assert.deepEqual(result, mappedAttribs);
  });
});
