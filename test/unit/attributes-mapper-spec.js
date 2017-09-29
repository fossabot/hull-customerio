/* global describe, it */
import AttributesMapper from "../../server/lib/attributes-mapper";
import assert from "assert";

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
      "traits_salesforce_lead/title": "Customer Success",
      email: "tb@hull.io"
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
    const result = mapper.mapAttributesForService(user, "1360013296");

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
      "traits_salesforce_lead/title": "Customer Success",
      email: "tb@hull.io"
    };

    const mappedAttribs = {
      "salesforce_lead-title": "Customer Success",
      first_name: "Thomas",
      last_name: "Bass",
      created_at: "1360013296",
      email: "tb@hull.io"
    };

    const mapper = new AttributesMapper(attribMappings);
    const result = mapper.mapAttributesForService(user, "1360013296");

    assert.deepEqual(result, mappedAttribs);
  });
});
