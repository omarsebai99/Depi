const crypto = require("crypto");

const SCRYPT_KEY_LENGTH = 64;

const deriveKey = (password, salt) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString("hex"));
    });
  });

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt);
  return `${salt}:${hash}`;
};

const verifyPassword = async (password, storedHash) => {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, originalHash] = storedHash.split(":");
  const calculatedHash = await deriveKey(password, salt);
  const originalBuffer = Buffer.from(originalHash, "hex");
  const calculatedBuffer = Buffer.from(calculatedHash, "hex");

  if (originalBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(originalBuffer, calculatedBuffer);
};

module.exports = {
  hashPassword,
  verifyPassword,
};
