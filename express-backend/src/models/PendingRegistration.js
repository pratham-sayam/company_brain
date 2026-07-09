'use strict';

const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required.'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },

  // ── Email verification code (same fields as User for codeService compat) ──
  emailVerificationCodeHash:          { type: String },
  emailVerificationIssuedAt:          { type: Date },
  emailVerificationExpires:           { type: Date },
  emailVerificationAttempts:          { type: Number, default: 0 },
  emailVerificationLockedUntil:       { type: Date },
  emailVerificationResendAvailableAt: { type: Date },
  emailVerificationResendCount:       { type: Number, default: 0 },
  emailVerificationResendWindowStart: { type: Date },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 1800, // TTL: 30 minutes — MongoDB auto-deletes expired documents
  },
});

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
