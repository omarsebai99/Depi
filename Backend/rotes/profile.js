const express = require("express");
const crypto = require("crypto");
const fs = require("fs/promises");

const requireAuth = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const User = require("../models/User");
const sendCVToPython = require("../services/pythonService");
const {
  openDownloadStream,
  uploadFileToGridFS,
  deleteFileFromGridFS,
} = require("../services/gridfsService");
const {
  emptyProfile,
  normalizeProfile,
  profileFromAnalysisResult,
  serializeCv,
  serializeUser,
} = require("../utils/profile");

const router = express.Router();

const hashFileFromPath = async (filePath) => {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
};

const buildProfileResponse = (
  user,
  message = "Profile loaded successfully",
) => ({
  status: "success",
  message,
  data: {
    user: serializeUser(user),
    profile: normalizeProfile(user.profile),
    cvs: [...(user.cvs || [])].reverse().map(serializeCv),
  },
});

const reloadUser = async (userId) => User.findById(userId);

const getCvSnapshot = (user, cvId) => {
  const snapshot = user.cvs.id(cvId);
  if (!snapshot) {
    const error = new Error("CV snapshot not found");
    error.statusCode = 404;
    throw error;
  }

  return snapshot;
};

router.get("/me", requireAuth, async (req, res) => {
  res.json(buildProfileResponse(req.user));
});

router.put("/me", requireAuth, async (req, res) => {
  try {
    const nextProfile = normalizeProfile(
      req.body?.profile || req.body,
      req.user.profile,
      { touch: true },
    );
    req.user.profile = nextProfile;

    if (nextProfile.candidate.fullName) {
      req.user.name = nextProfile.candidate.fullName;
    }

    await req.user.save();
    const freshUser = await reloadUser(req.user._id);

    res.json(buildProfileResponse(freshUser, "Profile updated successfully"));
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message || "Failed to update profile",
    });
  }
});

router.put("/cvs/:cvId", requireAuth, async (req, res) => {
  try {
    const snapshot = getCvSnapshot(req.user, req.params.cvId);
    const nextProfile = normalizeProfile(
      req.body?.profile || req.body,
      snapshot.profile,
      { touch: true },
    );

    snapshot.profile = nextProfile;
    req.user.profile = nextProfile;

    if (nextProfile.candidate.fullName) {
      req.user.name = nextProfile.candidate.fullName;
    }

    await req.user.save();
    const freshUser = await reloadUser(req.user._id);

    res.json(
      buildProfileResponse(
        freshUser,
        "Saved CV snapshot updated successfully",
      ),
    );
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message || "Failed to update saved CV",
    });
  }
});

router.delete("/cvs/:cvId", requireAuth, async (req, res) => {
  try {
    const wasLatestSnapshot =
      String(req.user.cvs?.[req.user.cvs.length - 1]?._id || "") ===
      String(req.params.cvId);

    const snapshot = getCvSnapshot(req.user, req.params.cvId);
    const storedFileId = snapshot.storedFileId;
    const deletedFileName = snapshot.fileName || "CV";

    snapshot.deleteOne();

    if (storedFileId) {
      await deleteFileFromGridFS(storedFileId);
    }

    if (!req.user.cvs.length) {
      req.user.profile = normalizeProfile(emptyProfile(), emptyProfile(), {
        touch: true,
      });
    } else if (wasLatestSnapshot) {
      const latestSnapshot = req.user.cvs[req.user.cvs.length - 1];
      req.user.profile = normalizeProfile(latestSnapshot.profile, req.user.profile, {
        touch: true,
      });
    }

    await req.user.save();
    const freshUser = await reloadUser(req.user._id);

    res.json(
      buildProfileResponse(
        freshUser,
        `Saved CV deleted successfully: ${deletedFileName}`,
      ),
    );
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message || "Failed to delete saved CV",
    });
  }
});

router.delete("/reset", requireAuth, async (req, res) => {
  try {
    const storedFileIds = [...(req.user.cvs || [])]
      .map((snapshot) => snapshot?.storedFileId)
      .filter(Boolean);

    for (const fileId of storedFileIds) {
      await deleteFileFromGridFS(fileId);
    }

    req.user.profile = normalizeProfile(emptyProfile(), emptyProfile(), {
      touch: true,
    });
    req.user.cvs = [];

    await req.user.save();

    res.json(buildProfileResponse(req.user, "Profile reset successfully"));
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message || "Failed to reset profile",
    });
  }
});

router.get("/cvs/:cvId/file", requireAuth, async (req, res) => {
  try {
    const snapshot = getCvSnapshot(req.user, req.params.cvId);

    if (!snapshot.storedFileId) {
      return res.status(404).json({
        status: "error",
        message: "Original PDF is not available for this CV",
      });
    }

    res.setHeader(
      "Content-Type",
      snapshot.storedContentType || "application/pdf",
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${snapshot.fileName || "cv.pdf"}"`,
    );

    const downloadStream = openDownloadStream(snapshot.storedFileId);
    downloadStream.on("error", (error) => {
      if (!res.headersSent) {
        res.status(404).json({
          status: "error",
          message: error.message || "Stored PDF not found",
        });
      } else {
        res.end();
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message || "Failed to open stored PDF",
    });
  }
});

router.post(
  "/upload-cv",
  requireAuth,
  upload.single("cv"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "No file uploaded",
      });
    }

    let storedFile = null;
    const startedAt = Date.now();

    try {
      const analysisResult = await sendCVToPython(req.file.path);
      const sourceFileHash = await hashFileFromPath(req.file.path);

      storedFile = await uploadFileToGridFS({
        filePath: req.file.path,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        userId: req.user._id,
      });

      const profile = profileFromAnalysisResult(
        analysisResult,
        req.user.profile,
        req.file.originalname,
        {
          sourceFileHash,
          analysisDurationMs: Date.now() - startedAt,
        },
      );

      req.user.profile = profile;
      if (profile.candidate.fullName) {
        req.user.name = profile.candidate.fullName;
      }

      req.user.cvs.push({
        fileName: req.file.originalname,
        storedFileId: storedFile.fileId,
        storedContentType: storedFile.contentType,
        storedFileSize: storedFile.size,
        profile,
        uploadedAt: new Date(),
      });

      await req.user.save();
      const freshUser = await reloadUser(req.user._id);

      res.json({
        ...buildProfileResponse(
          freshUser,
          "CV uploaded, analyzed, and saved to profile",
        ),
        data: {
          ...buildProfileResponse(freshUser).data,
          analysis: normalizeProfile(profile),
        },
      });
    } catch (error) {
      if (storedFile?.fileId) {
        try {
          await deleteFileFromGridFS(storedFile.fileId);
        } catch (cleanupError) {
          console.error(
            "Failed to delete orphaned GridFS file:",
            cleanupError.message,
          );
        }
      }

      const statusCode = error.statusCode || error.response?.status || 500;
      const upstreamMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message;

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
  },
);

module.exports = router;
