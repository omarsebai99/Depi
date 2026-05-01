const crypto = require("crypto");

const TOKEN_SECRET = process.env.AUTH_SECRET || "change-this-auth-secret";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlDecode = (value) => {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
};

const sign = (value) =>
  base64UrlEncode(
    crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest(),
  );

const createToken = (payload) => {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    }),
  );

  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || typeof token !== "string") {
    throw new Error("Invalid token");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed token");
  }

  const [header, body, signature] = parts;
  const expectedSignature = sign(`${header}.${body}`);

  if (signature !== expectedSignature) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(body));
  const now = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < now) {
    throw new Error("Token expired");
  }

  return payload;
};

module.exports = {
  createToken,
  verifyToken,
};
