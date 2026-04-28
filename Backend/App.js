require("dotenv").config();
const express = require("express");
const cors = require("cors");
const upload = require("./rotes/upload");

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

app.get("/", (req, res) => {
  res.send("API is running");
});

app.use("/api", upload);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
