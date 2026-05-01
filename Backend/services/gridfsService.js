const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const BUCKET_NAME = "uploaded_cvs";

const getBucket = () => {
  if (!mongoose.connection?.db) {
    throw new Error("Mongo connection is not ready");
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: BUCKET_NAME,
  });
};

const uploadFileToGridFS = async ({
  filePath,
  originalName,
  mimeType,
  userId,
}) => {
  const bucket = getBucket();
  const safeFileName = path.basename(originalName || "cv.pdf");

  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath);
    const uploadStream = bucket.openUploadStream(safeFileName, {
      contentType: mimeType || "application/pdf",
      metadata: {
        userId: String(userId),
        originalName: safeFileName,
      },
    });

    readStream.on("error", reject);
    uploadStream.on("error", reject);
    uploadStream.on("finish", async () => {
      try {
        const [storedFile] = await bucket
          .find({ _id: uploadStream.id })
          .toArray();

        if (!storedFile) {
          reject(new Error("Stored GridFS file metadata was not found"));
          return;
        }

        resolve({
          fileId: String(storedFile._id),
          fileName: storedFile.filename,
          contentType: storedFile.contentType || mimeType || "application/pdf",
          size: storedFile.length || 0,
        });
      } catch (error) {
        reject(error);
      }
    });

    readStream.pipe(uploadStream);
  });
};

const openDownloadStream = (fileId) => {
  const bucket = getBucket();
  return bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
};

const deleteFileFromGridFS = async (fileId) => {
  if (!fileId) {
    return;
  }

  let objectId;
  try {
    objectId = new mongoose.Types.ObjectId(fileId);
  } catch {
    return;
  }

  try {
    const bucket = getBucket();
    await bucket.delete(objectId);
  } catch (error) {
    if (/FileNotFound/i.test(error?.message || "")) {
      return;
    }
    throw error;
  }
};

module.exports = {
  uploadFileToGridFS,
  openDownloadStream,
  deleteFileFromGridFS,
};
