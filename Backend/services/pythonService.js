const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const sendCVToPython = async (filePath) => {
    const form = new FormData();
    form.append('file' , fs.createReadStream(filePath));

    const response = await axios.post(
        'http://localhost:8000/parse-cv',
        form,
        {
            headers: form.getHeaders(),
            timeout: 30000
        }
    );

    return response.data;
};

module.exports = sendCVToPython;