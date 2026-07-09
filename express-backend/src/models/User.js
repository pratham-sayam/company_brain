const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
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
      select: false,
      required: function () {
        return this.provider === 'local';
      },
    },
    provider: {
      type: String,
      default: 'local',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // ── Email verification code (hashed, never plaintext) ──
    emailVerificationCodeHash:          { type: String,  select: false },
    emailVerificationIssuedAt:          { type: Date,    select: false },
    emailVerificationExpires:           { type: Date,    select: false },
    emailVerificationAttempts:          { type: Number,  select: false, default: 0 },
    emailVerificationLockedUntil:       { type: Date,    select: false },
    emailVerificationResendAvailableAt: { type: Date,    select: false },
    emailVerificationResendCount:       { type: Number,  select: false, default: 0 },
    emailVerificationResendWindowStart: { type: Date,    select: false },

    // ── Password reset code (hashed, never plaintext) ──────
    passwordResetCodeHash:          { type: String,  select: false },
    passwordResetIssuedAt:          { type: Date,    select: false },
    passwordResetExpires:           { type: Date,    select: false },
    passwordResetAttempts:          { type: Number,  select: false, default: 0 },
    passwordResetLockedUntil:       { type: Date,    select: false },
    passwordResetResendAvailableAt: { type: Date,    select: false },
    passwordResetResendCount:       { type: Number,  select: false, default: 0 },
    passwordResetResendWindowStart: { type: Date,    select: false },

    // ── Refresh token (hashed) ─────────────────────────────
    refreshToken:        { type: String, select: false },
    refreshTokenExpires: { type: Date,   select: false },

    // ── Login lockout ──────────────────────────────────────
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil:           { type: Date,   default: null },

    // ── Soft delete ────────────────────────────────────────
    isDeleted:  { type: Boolean, default: false },
    deletedAt:  { type: Date,    select: false },
  },
  { timestamps: true }
);

// Exclude all sensitive fields from JSON responses
userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.password;
    // Verification code fields
    delete ret.emailVerificationCodeHash;
    delete ret.emailVerificationIssuedAt;
    delete ret.emailVerificationExpires;
    delete ret.emailVerificationAttempts;
    delete ret.emailVerificationLockedUntil;
    delete ret.emailVerificationResendAvailableAt;
    delete ret.emailVerificationResendCount;
    delete ret.emailVerificationResendWindowStart;
    // Reset code fields
    delete ret.passwordResetCodeHash;
    delete ret.passwordResetIssuedAt;
    delete ret.passwordResetExpires;
    delete ret.passwordResetAttempts;
    delete ret.passwordResetLockedUntil;
    delete ret.passwordResetResendAvailableAt;
    delete ret.passwordResetResendCount;
    delete ret.passwordResetResendWindowStart;
    // Refresh token
    delete ret.refreshToken;
    delete ret.refreshTokenExpires;
    // Login lockout
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    // Soft delete
    delete ret.isDeleted;
    delete ret.deletedAt;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
