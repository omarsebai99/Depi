const emptyProfile = () => ({
  candidate: {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    currentRole: "",
    suggestedRole: "",
    experienceYears: 0,
    experienceLevel: "",
    summary: "",
  },
  extraction: {
    skills: [],
    highlights: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    interviewNotes: [],
  },
  metadata: {
    rawRoleText: "",
    parser: "",
    parserVersion: "",
    llmStatus: "",
    llmError: "",
    cleanTextPreview: "",
    cleanTextLength: 0,
    rawTextLength: 0,
    warnings: [],
    sourceFileHash: "",
    analysisDurationMs: 0,
  },
  cleanCvText: "",
  lastCvFileName: "",
  lastUpdatedAt: new Date(),
});

const toCleanString = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toDateValue = (value, fallback = new Date()) => {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return [
      ...new Set(value.map((item) => toCleanString(item)).filter(Boolean)),
    ];
  }

  if (typeof value === "string") {
    return [
      ...new Set(
        value
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }

  return [];
};

const toPlainObject = (value) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (typeof value.toObject === "function") {
    return value.toObject({
      depopulate: true,
      getters: false,
      virtuals: false,
      minimize: false,
    });
  }

  return value;
};

const normalizeProfile = (
  input = {},
  existingProfile = emptyProfile(),
  options = {},
) => {
  const safeInput = toPlainObject(input) || {};
  const safeExistingProfile = toPlainObject(existingProfile) || emptyProfile();
  const safeInputCandidate = toPlainObject(safeInput.candidate) || {};
  const safeExistingCandidate =
    toPlainObject(safeExistingProfile.candidate) || {};
  const safeInputExtraction = toPlainObject(safeInput.extraction) || {};
  const safeExistingExtraction =
    toPlainObject(safeExistingProfile.extraction) || {};
  const safeInputMetadata = toPlainObject(safeInput.metadata) || {};
  const safeExistingMetadata =
    toPlainObject(safeExistingProfile.metadata) || {};

  const baseProfile = emptyProfile();
  const profile = {
    ...baseProfile,
    ...safeExistingProfile,
    ...safeInput,
    candidate: {
      ...baseProfile.candidate,
      ...safeExistingCandidate,
      ...safeInputCandidate,
    },
    extraction: {
      ...baseProfile.extraction,
      ...safeExistingExtraction,
      ...safeInputExtraction,
    },
    metadata: {
      ...baseProfile.metadata,
      ...safeExistingMetadata,
      ...safeInputMetadata,
    },
  };

  return {
    candidate: {
      fullName: toCleanString(profile.candidate.fullName),
      email: toCleanString(profile.candidate.email),
      phone: toCleanString(profile.candidate.phone),
      location: toCleanString(profile.candidate.location),
      linkedin: toCleanString(profile.candidate.linkedin),
      github: toCleanString(profile.candidate.github),
      portfolio: toCleanString(profile.candidate.portfolio),
      currentRole: toCleanString(profile.candidate.currentRole),
      suggestedRole: toCleanString(profile.candidate.suggestedRole),
      experienceYears: toNumber(profile.candidate.experienceYears, 0),
      experienceLevel: toCleanString(profile.candidate.experienceLevel),
      summary: toCleanString(profile.candidate.summary),
    },
    extraction: {
      skills: toStringArray(profile.extraction.skills),
      highlights: toStringArray(profile.extraction.highlights),
      experience: toStringArray(profile.extraction.experience),
      education: toStringArray(profile.extraction.education),
      projects: toStringArray(profile.extraction.projects),
      certifications: toStringArray(profile.extraction.certifications),
      interviewNotes: toStringArray(profile.extraction.interviewNotes),
    },
    metadata: {
      rawRoleText: toCleanString(profile.metadata.rawRoleText),
      parser: toCleanString(profile.metadata.parser),
      parserVersion: toCleanString(profile.metadata.parserVersion),
      llmStatus: toCleanString(profile.metadata.llmStatus),
      llmError: toCleanString(profile.metadata.llmError),
      cleanTextPreview: toCleanString(profile.metadata.cleanTextPreview),
      cleanTextLength: toNumber(profile.metadata.cleanTextLength, 0),
      rawTextLength: toNumber(profile.metadata.rawTextLength, 0),
      warnings: toStringArray(profile.metadata.warnings),
      sourceFileHash: toCleanString(profile.metadata.sourceFileHash),
      analysisDurationMs: toNumber(profile.metadata.analysisDurationMs, 0),
    },
    cleanCvText: toCleanString(profile.cleanCvText),
    lastCvFileName: toCleanString(profile.lastCvFileName),
    lastUpdatedAt: options.touch
      ? new Date()
      : toDateValue(profile.lastUpdatedAt, new Date()),
  };
};

const profileFromAnalysisResult = (
  analysisResult,
  existingProfile,
  fileName,
  extraMetadata = {},
) => {
  const aiProfile = analysisResult?.data || {};
  return normalizeProfile(
    {
      candidate: aiProfile.candidate || {},
      extraction: {
        ...(aiProfile.extraction || {}),
        interviewNotes: existingProfile?.extraction?.interviewNotes || [],
      },
      metadata: {
        ...(aiProfile.metadata || {}),
        ...extraMetadata,
      },
      cleanCvText: analysisResult?.clean_cv_text || "",
      lastCvFileName: fileName || "",
    },
    existingProfile,
    { touch: true },
  );
};

const serializeCv = (cv) => ({
  id: String(cv._id),
  fileName: cv.fileName,
  storedFileId: cv.storedFileId || "",
  storedContentType: cv.storedContentType || "application/pdf",
  storedFileSize: toNumber(cv.storedFileSize, 0),
  fileUrl: cv.storedFileId ? `/api/profile/cvs/${String(cv._id)}/file` : "",
  uploadedAt: cv.uploadedAt,
  profile: normalizeProfile(cv.profile),
});

const serializeUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

module.exports = {
  emptyProfile,
  normalizeProfile,
  profileFromAnalysisResult,
  serializeCv,
  serializeUser,
};
