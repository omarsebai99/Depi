const mongoose = require("mongoose");

const stringArrayField = {
  type: [String],
  default: [],
};

const candidateSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    location: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    github: { type: String, default: "" },
    portfolio: { type: String, default: "" },
    currentRole: { type: String, default: "" },
    suggestedRole: { type: String, default: "" },
    experienceYears: { type: Number, default: 0 },
    experienceLevel: { type: String, default: "" },
    summary: { type: String, default: "" },
  },
  { _id: false },
);

const extractionSchema = new mongoose.Schema(
  {
    skills: stringArrayField,
    highlights: stringArrayField,
    experience: stringArrayField,
    education: stringArrayField,
    projects: stringArrayField,
    certifications: stringArrayField,
    interviewNotes: stringArrayField,
  },
  { _id: false },
);

const metadataSchema = new mongoose.Schema(
  {
    rawRoleText: { type: String, default: "" },
    parser: { type: String, default: "" },
    parserVersion: { type: String, default: "" },
    llmStatus: { type: String, default: "" },
    llmError: { type: String, default: "" },
    cleanTextPreview: { type: String, default: "" },
    cleanTextLength: { type: Number, default: 0 },
    rawTextLength: { type: Number, default: 0 },
    warnings: stringArrayField,
    sourceFileHash: { type: String, default: "" },
    analysisDurationMs: { type: Number, default: 0 },
  },
  { _id: false },
);

const profileSchema = new mongoose.Schema(
  {
    candidate: { type: candidateSchema, default: () => ({}) },
    extraction: { type: extractionSchema, default: () => ({}) },
    metadata: { type: metadataSchema, default: () => ({}) },
    cleanCvText: { type: String, default: "" },
    lastCvFileName: { type: String, default: "" },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const cvSnapshotSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: "" },
    storedFileId: { type: String, default: "" },
    storedContentType: { type: String, default: "application/pdf" },
    storedFileSize: { type: Number, default: 0 },
    profile: { type: profileSchema, default: () => ({}) },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    profile: { type: profileSchema, default: () => ({}) },
    cvs: { type: [cvSnapshotSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
