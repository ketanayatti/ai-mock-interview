const mongoose = require('mongoose');

const interviewRoundSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  status:     { type: String, default: 'not completed' },
  summary:    { type: String, default: '' },
  // Cached output from 3-stage AI pipeline — set once, reused forever
  aiInsights: { type: mongoose.Schema.Types.Mixed, default: null },
});

// Schema for the space (company)
const spaceSchema = new mongoose.Schema({
  studentId: { 
    type: String,  // Changed from ObjectId to String
    required: true // Now stores the uniqueId instead of studentId
  },
  companyName: { 
    type: String, 
    required: true, // Company name for the space
  },
  jobPosition: { 
    type: String, 
    required: true, // Job position for the interview space
  },
  jobDescription: { 
    type: String, 
    required: true, // Brief job description provided by the student or company
  },
  experienceLevel: {
    type: String,
    enum: ['fresher', 'intermediate', 'experienced'],
    default: 'fresher',
    required: true,
  },
  interviewRounds: [interviewRoundSchema], // List of interview rounds associated with this space
  resumePath: { 
    type: String, 
    required: true, // Path to the uploaded resume file
  },
  resumeText: {
    type: String,
    required: true  // The text extracted from the resume
  },
  purifiedSummary: {
    type: String,
    required: true  // The text extracted from the resume
  },
}, { timestamps: true }); // Automatically create timestamps for creation and update times

// Create the Space model
const Space = mongoose.model('Space', spaceSchema);

module.exports = Space;
