import crypto from "crypto";
import qs from "querystring";

const algorithm = "aes-128-cbc";

export function encrypt(text, password) {
  const cipher = crypto.createCipher(algorithm, password);
  let crypted = cipher.update(qs.stringify(text), "utf8", "base64");
  crypted += cipher.final("base64");
  return encodeURIComponent(crypted);
}

export function decrypt(text, password) {
  const decipher = crypto.createDecipher(algorithm, password);
  let dec = decipher.update(text, "base64", "utf8");
  dec += decipher.final("utf8");
  return qs.parse(dec);
}

export function middleware(password) {
  return (req, res, next) => {
    if (req.query.conf) {
      req.hull = req.hull || {};
      req.hull.config = decrypt(req.query.conf, password);
    }
    next();
  };
}
