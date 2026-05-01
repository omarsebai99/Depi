const express = require("express");

const User = require("../models/User");
const {
  emptyProfile,
  normalizeProfile,
  serializeCv,
  serializeUser,
} = require("../utils/profile");
const { hashPassword, verifyPassword } = require("../utils/password");
const { createToken } = require("../utils/token");

const router = express.Router();

const buildAuthResponse = (user) => ({
  status: "success",
  message: "Authentication succeeded",
  token: createToken({ userId: String(user._id), email: user.email }),
  data: {
    user: serializeUser(user),
    profile: normalizeProfile(user.profile || emptyProfile()),
    cvs: [...(user.cvs || [])].reverse().map(serializeCv),
  },
});

router.post("/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "name, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        status: "error",
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await hashPassword(password);
    const profile = normalizeProfile({
      candidate: {
        fullName: name,
        email,
      },
    });

    const user = await User.create({
      name,
      email,
      passwordHash,
      profile,
    });

    res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to register user",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "email and password are required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    res.json(buildAuthResponse(user));
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to login",
    });
  }
});

module.exports = router;
