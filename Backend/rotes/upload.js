const express = require("express");
const fs = require("fs/promises");

const router = express.Router();
const upload = require("../middlewares/uploadMiddleware");
const sendCVToPython = require("../services/pythonService");

router.post("/upload", (req, res) => {
  res.json({ message: "upload route ready" });
});

router.post("/upload-cv", upload.single("cv"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const result = await sendCVToPython(req.file.path);

    res.status(200).json({
      status: "success",
      message: "PDF uploaded and analyzed successfully",
      ...result,
    });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const upstreamMessage =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message;

    console.error("Error while sending file to AI service:", upstreamMessage);

    res.status(statusCode).json({
      status: "error",
      message: "Failed to process CV",
      error: upstreamMessage,
    });
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (cleanupError) {
      console.error("Failed to delete uploaded file:", cleanupError.message);
    }
  }
});

module.exports = router;
