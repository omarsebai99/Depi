const mongoose = require("mongoose");

const connectDatabase = async () => {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    throw new Error("MONGO_URL is not configured");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  return mongoose.connect(mongoUrl, {
    dbName: process.env.MONGO_DB_NAME || "smart_virtual_interview",
  });
};

module.exports = connectDatabase;
