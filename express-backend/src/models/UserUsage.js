const mongoose = require('mongoose');

const userUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // ── File upload tracking (rolling 30-day window) ──────
    filesUploadedThisPeriod: {
      type: Number,
      default: 0,
      min: 0,
    },
    filePeriodStart: {
      type: Date,
      required: true,
    },

    // ── Copilot message tracking (rolling 24-hour window) ─
    messagesToday: {
      type: Number,
      default: 0,
      min: 0,
    },
    messageDayStart: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserUsage', userUsageSchema);
