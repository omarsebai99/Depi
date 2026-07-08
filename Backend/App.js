require("dotenv").config();
const cors = require("cors");
const express = require("express");
const multer = require("multer");

const connectDatabase = require("./DB/connectDatabase");
const authRoutes = require("./rotes/auth");
const profileRoutes = require("./rotes/profile");

const app = express();

app.use(express.json({ limit: "2mb" }));
const allowedOrigins = [
  "http://localhost:5173",
  "https://smart-virtual-interview.vercel.app",
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isLocal =
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:");
      if (allowedOrigins.includes(origin) || isLocal) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
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
