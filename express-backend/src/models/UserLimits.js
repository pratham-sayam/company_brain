const mongoose = require('mongoose');

const userLimitsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // ── Configurable limits (override defaults per user) ───
    monthlyFileLimit: {
      type: Number,
      default: 500,
      min: 0,
    },
    dailyMessageLimit: {
      type: Number,
      default: 25,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserLimits', userLimitsSchema);
