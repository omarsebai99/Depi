const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const sendCVToPython = require('../services/pythonService');

router.post('/upload' ,(req,res) => {
    res.json({message: 'upload route ready'});
});


router.post('/upload-cv' , upload.single('cv'), async (req,res) => {
    try {
        if(!req.file) {
            return res.status(400).json({message: 'no file uploaded'});
        }

        const result = await sendCVToPython(req.file.path);

        res.status(200).json({
            message: 'PDF uploaded and parsed successfully',
            data: result
        });
    } catch (error) {
        console.error('error while sending file to python:',error.message);

        res.status(500).json({
            message: 'failed to process CV',
            error: error.message
        });
        
    }
});

module.exports = router;