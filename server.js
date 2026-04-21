require("dotenv").config();

const connectDB = require("./src/config/dbConfig");
const app = require("./src/app");

const PORT = process.env.PORT || 3000;
let server;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log("[APP] Database connection established");

    // Mark app as ready
    app.setReady(true);
    console.log("[APP] Application ready to accept traffic");

    // Start server
    server = app.listen(PORT, () => {
      console.log(`[APP] Server started on port ${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("[APP] SIGTERM received, shutting down gracefully");
      app.setReady(false);
      server.close(() => {
        console.log("[APP] Server closed");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("[APP] Failed to start server:", error.message);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("[APP] Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("[APP] Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

startServer();
