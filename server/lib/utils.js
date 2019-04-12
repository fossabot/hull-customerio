/* @flow */

import type { THullReqContext } from "hull/lib";

const _ = require("lodash");

function getNumberFromContext(reqContext: THullReqContext, settingPath: string, defaultNumber: number) {
  const value = _.get(reqContext, settingPath, null);

  if (value === null) {
    return defaultNumber;
  } else if (typeof value === "number") {
    return value;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) { return defaultNumber; }

  return parsedValue;
}

module.exports = { getNumberFromContext };
