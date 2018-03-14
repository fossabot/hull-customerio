/* @flow */

const crypto = require("crypto");
const qs = require("querystring");

const algorithm = "aes-128-cbc";


function encrypt(text: any, password: any): string {
  const cipher = crypto.createCipher(algorithm, password);
  let crypted = cipher.update(qs.stringify(text), "utf8", "base64");
  crypted += cipher.final("base64");
  return encodeURIComponent(crypted);
}

function decrypt(text: string, password: any): any {
  const decipher = crypto.createDecipher(algorithm, password);
  let dec = decipher.update(decodeURIComponent(text), "base64", "utf8");
  dec += decipher.final("utf8");
  return qs.parse(dec);
}

function middleware(password: any) {
  return (req, res, next) => {
    if (req.query.conf) {
      req.hull = req.hull || {};
      req.hull.config = decrypt(req.query.conf, password);
    }
    next();
  };
}

module.exports = {
  encrypt,
  decrypt,
  middleware
};
