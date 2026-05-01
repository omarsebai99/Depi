const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const sendCVToPython = async (filePath) => {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  const response = await axios.post(`${AI_SERVICE_URL}/analyze-cv`, form, {
    headers: form.getHeaders(),
    timeout: 45000,
  });

  return response.data;
};

module.exports = sendCVToPython;
