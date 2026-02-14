const mongoose = require("mongoose");
require("dotenv").config();
const dns = require("dns");

dns.setServers(["8.8.8.8"]);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    }); // Simplified connection string
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
