const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const postToAiService = async (path, body) => {
  const response = await axios.post(`${AI_SERVICE_URL}${path}`, body, {
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 45000,
  });

  return response.data;
};

const sendCVToPython = async (filePath) => {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  const response = await axios.post(`${AI_SERVICE_URL}/analyze-cv`, form, {
    headers: form.getHeaders(),
    timeout: 45000,
  });

  return response.data;
};

const startInterviewSession = async (payload) =>
  postToAiService("/interview/session/start", payload);

const evaluateInterviewAnswer = async (payload) =>
  postToAiService("/interview/session/answer", payload);

module.exports = {
  sendCVToPython,
  startInterviewSession,
  evaluateInterviewAnswer,
};
