const express = require("express");
const crypto = require("crypto");
const fs = require("fs/promises");

const requireAuth = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const User = require("../models/User");
const {
  sendCVToPython,
  startInterviewSession,
  evaluateInterviewAnswer,
} = require("../services/pythonService");
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
  serializeInterviewSession,
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
    interviewSessions: [...(user.interviewSessions || [])]
      .reverse()
      .map(serializeInterviewSession),
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

router.post("/interview/session/start", requireAuth, async (req, res) => {
  try {
    const questionCount = Number(req.body?.questionCount) || 5;
    const aiResult = await startInterviewSession({
      profile: normalizeProfile(req.user.profile),
      question_count: questionCount,
    });

    res.json(aiResult);
  } catch (error) {
    const statusCode = error.statusCode || error.response?.status || 500;
    const upstreamMessage =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message;

    res.status(statusCode).json({
      status: "error",
      message: "Failed to start interview session",
      error: upstreamMessage,
    });
  }
});

router.post("/interview/session/answer", requireAuth, async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const answer = String(req.body?.answer || "").trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!question || !answer) {
      return res.status(400).json({
        status: "error",
        message: "question and answer are required",
      });
    }

    const aiResult = await evaluateInterviewAnswer({
      profile: normalizeProfile(req.user.profile),
      question,
      answer,
      history,
    });

    res.json(aiResult);
  } catch (error) {
    const statusCode = error.statusCode || error.response?.status || 500;
    const upstreamMessage =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message;

    res.status(statusCode).json({
      status: "error",
      message: "Failed to evaluate interview answer",
      error: upstreamMessage,
    });
  }
});

router.post("/interview/session/save", requireAuth, async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const summary = String(req.body?.summary || "").trim();
    const requestedCvId = String(req.body?.cvId || "").trim();
    
    // Calculate average score and construct structured entries
    let totalScore = 0;
    const parsedEntries = entries.map((entry) => {
      const score = Number(entry?.score) || 0;
      totalScore += score;
      return {
        question: String(entry?.question || "").trim(),
        answer: String(entry?.answer || "").trim(),
        score,
        strengths: Array.isArray(entry?.strengths) ? entry.strengths.map(String) : [],
        improvements: Array.isArray(entry?.improvements) ? entry.improvements.map(String) : [],
        coachReply: String(entry?.coachReply || "").trim(),
      };
    });
    const averageScore = parsedEntries.length ? Math.round(totalScore / parsedEntries.length) : 0;

    // Save the structured session
    req.user.interviewSessions.push({
      summary,
      averageScore,
      entries: parsedEntries,
      cvId: requestedCvId,
      createdAt: new Date(),
    });

    // Backward compatibility: build flat notes strings for profile.extraction.interviewNotes
    const notes = [];
    if (summary) {
      notes.push(`Session Summary: ${summary}`);
    }

    parsedEntries.forEach((entry, index) => {
      if (entry.question) notes.push(`Q${index + 1}: ${entry.question}`);
      if (entry.answer) notes.push(`A${index + 1}: ${entry.answer}`);
      if (Number.isFinite(entry.score)) notes.push(`Score ${index + 1}: ${entry.score}/10`);
      if (entry.coachReply) notes.push(`Coach ${index + 1}: ${entry.coachReply}`);
    });

    const currentProfile = normalizeProfile(req.user.profile);
    const existingNotes = currentProfile.extraction.interviewNotes;
    const nextProfile = normalizeProfile(
      {
        ...currentProfile,
        extraction: {
          ...currentProfile.extraction,
          interviewNotes: [...existingNotes, ...notes],
        },
      },
      req.user.profile,
      { touch: true },
    );
    req.user.profile = nextProfile;

    if (requestedCvId) {
      const snapshot = req.user.cvs.id(requestedCvId);
      if (snapshot) {
        snapshot.profile = nextProfile;
      }
    } else if (req.user.cvs.length) {
      req.user.cvs[req.user.cvs.length - 1].profile = nextProfile;
    }

    await req.user.save();
    const freshUser = await reloadUser(req.user._id);

    res.json(buildProfileResponse(freshUser, "Interview session saved successfully"));
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message || "Failed to save interview session",
    });
  }
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
