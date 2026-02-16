// controllers/sessionController.js
const Session = require("../models/sessionModel");
const crypto = require("crypto");

// Helper: generate a unique 8-char hex ID
const generateUniqueId = () => crypto.randomBytes(4).toString("hex");

// Create a new session (used by the API route)
const createSession = async (name) => {
  const uniqueId = generateUniqueId();

  const session = await Session.create({
    uniqueId,
    name,
    spaces: [],
  });

  return session;
};

// Find a session by uniqueId (helper function)
const findSession = async (uniqueId) => {
  const session = await Session.findOne({ uniqueId });

  if (session) {
    session.lastActive = Date.now();
    await session.save();
  }

  return session;
};

// Create a new session (form-based)
const startNew = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).send("Name is required");
    }

    const uniqueId = generateUniqueId();

    await Session.create({
      uniqueId,
      name,
      spaces: [],
    });

    // Store in session cookie
    req.session.uniqueId = uniqueId;
    req.session.name = name;

    // Return success with uniqueId
    res.render("student/session-created", {
      uniqueId,
      name,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).send("Error creating session. Please try again.");
  }
};

// Continue with existing session
const continueSession = async (req, res) => {
  try {
    const { uniqueId } = req.body;

    if (!uniqueId) {
      return res.status(400).send("Session ID is required");
    }

    const session = await Session.findOne({ uniqueId });

    if (!session) {
      return res.render("welcome", {
        error: "Session not found. Please check your ID.",
      });
    }

    // Update last active time
    session.lastActive = Date.now();
    await session.save();

    // Store in session cookie
    req.session.uniqueId = uniqueId;
    req.session.name = session.name;

    // Redirect to dashboard
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Error continuing session:", error);
    res.status(500).send("Error accessing session. Please try again.");
  }
};

// Get profile
const getProfile = async (req, res) => {
  try {
    const session = await Session.findOne({ uniqueId: req.session.uniqueId });

    if (!session) {
      return res.status(404).send("Session not found");
    }

    res.render("student/profile", {
      name: session.name,
      uniqueId: session.uniqueId,
      success: req.query.success || false,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send("Error fetching profile");
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const { name } = req.body;

    const session = await Session.findOneAndUpdate(
      { uniqueId: req.session.uniqueId },
      { name },
      { new: true },
    );

    if (!session) {
      return res.status(404).send("Session not found");
    }

    // Update session cookie
    req.session.name = name;

    res.redirect("/profile?success=true");
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).send("Failed to update profile");
  }
};

// End session
const endSession = (req, res) => {
  req.session = null; // Clear the session
  res.redirect("/"); // Redirect to welcome page
};

module.exports = {
  getProfile,
  updateProfile,
  startNew,
  continueSession,
  endSession,
  createSession,
  findSession,
};
