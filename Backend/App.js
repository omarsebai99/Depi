require("dotenv").config();
const cors = require("cors");
const express = require("express");
const multer = require("multer");

const connectDatabase = require("./db/connectDatabase");
const authRoutes = require("./rotes/auth");
const profileRoutes = require("./rotes/profile");

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

app.get("/", (req, res) => {
  res.send("API is running");
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }

  if (error) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Unexpected server error",
    });
  }

  next();
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`server is running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
