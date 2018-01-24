/* @flow */
import _ from "lodash";
import moment from "moment";

export default class AttributesMapper {
  userAttributesMapping: Array<string>;

  /**
   * Creates an instance of AttributesMapper.
   * @param {Array<string>} attributesMapping The list of attribute names
   * @memberof AttributesMapper
   */
  constructor(attributesMapping: Array<string>) {
    this.userAttributesMapping = attributesMapping;
  }

  /**
   * Maps the user attributes to send to 3rd party service.
   *
   * @param {Object} user The Hull user.
   * @param {string} creationDate The timestamp the user has been created.
   * @param {string} email The email address of the user
   * @returns {Object} The payload of mapped attributes.
   * @memberof AttributesMapper
   */
  mapAttributesForService(user: Object, creationDate: string, email: string): Object {
    // Ensure that we don't pick nested account attributes
    this.clearAccountsMapping();
    if (_.has(user, "account")) {
      _.forIn(user.account, (value, key) => {
        user[`account_${key}`] = value;
      });
    }

    // Ensure that we don't skip hull_segments
    if (!_.includes(this.userAttributesMapping, "hull_segments")) {
      this.userAttributesMapping.push("hull_segments");
    }

    let filteredAttributes = _.pick(user, this.userAttributesMapping);
    filteredAttributes = _.merge({ email }, filteredAttributes);

    // Set created_at if not present or deleted_at is set
    if (!_.has(user, "traits_customerio/created_at") || _.has(user, "traits_customerio/deleted_at")) {
      const created_at = creationDate;
      filteredAttributes = _.merge({ created_at }, filteredAttributes);
    }

    // Make attributes fail-safe
    let attributes = _.mapKeys(filteredAttributes, (value, key) => {
      if (_.startsWith(key, "traits_")) {
        return key.substr(7).split("/").join("-");
      }
      return key.split("/").join("-");
    });

    // Cast dates
    attributes = _.mapValues(attributes, (value, key) => {
      if (key !== "created_at"
        && (_.endsWith(key, "_date") || _.endsWith(key, "_at"))
        && moment(value).isValid()) {
        return moment(value).format("X");
      }
      return value;
    });

    return attributes;
  }

  clearAccountsMapping() {
    this.userAttributesMapping.forEach((v, i, a) => {
      if (_.startsWith(v, "account.")) {
        a[i] = _.replace(v, "account.", "account_");
      }
    });
  }
}
