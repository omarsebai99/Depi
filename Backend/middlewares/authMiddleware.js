const User = require("../models/User");
const { verifyToken } = require("../utils/token");

const requireAuth = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.userId);

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid authentication token",
      });
    }

    req.auth = payload;
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      status: "error",
      message: error.message || "Authentication failed",
    });
  }
};

module.exports = requireAuth;
