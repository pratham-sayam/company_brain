'use strict';

const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const validator  = require('validator');

const User        = require('../models/User');
const authService = require('../services/authService');

// ── Register ──────────────────────────────────────────────

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const { cooldownSeconds } = await authService.registerUser({ name, email, password });
    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for your verification code.',
      cooldownSeconds,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
}

// ── Verify Email ──────────────────────────────────────────

async function verifyEmail(req, res, next) {
  try {
    const { email, code } = req.body;
    await authService.verifyEmail(email, code);
    return res.status(200).json({ success: true, message: 'Email verified successfully.' });
  } catch (err) {
    if (err.statusCode) {
      const body = { success: false, error: err.message };
      if (err.retryAfterSeconds != null) body.retryAfterSeconds = err.retryAfterSeconds;
      if (err.attemptsLeft     != null) body.attemptsLeft     = err.attemptsLeft;
      return res.status(err.statusCode).json(body);
    }
    next(err);
  }
}

// ── Login ─────────────────────────────────────────────────

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
}

// ── Refresh Token ─────────────────────────────────────────

async function refreshTokens(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token is required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
    }

    const hashed = authService.hashToken(refreshToken);
    const user = await User.findOne({
      _id: decoded.userId,
      refreshToken: hashed,
      refreshTokenExpires: { $gt: Date.now() },
      isDeleted: { $ne: true },
    }).select('+refreshToken +refreshTokenExpires');

    if (!user) {
      return res.status(401).json({ success: false, error: 'Refresh token not recognised or already used.' });
    }

    const newAccessToken  = authService.issueAccessToken(user._id);
    const newRefreshToken = authService.issueRefreshToken(user._id);

    user.refreshToken        = authService.hashToken(newRefreshToken);
    user.refreshTokenExpires = new Date(Date.now() + authService.REFRESH_TOKEN_TTL_MS);
    await user.save();

    return res.status(200).json({
      success:      true,
      accessToken:  newAccessToken,
      refreshToken: newRefreshToken,
      user:         user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
}

// ── Get Current User ──────────────────────────────────────

async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user)          return res.status(401).json({ success: false, error: 'User not found.' });
    if (user.isDeleted) return res.status(403).json({ success: false, error: 'Account deleted.' });
    return res.status(200).json({ success: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

// ── Logout ────────────────────────────────────────────────

async function logoutHandler(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const hashed  = authService.hashToken(refreshToken);
        await User.findOneAndUpdate(
          { _id: decoded.userId, refreshToken: hashed },
          { $unset: { refreshToken: '', refreshTokenExpires: '' } }
        );
      } catch {
        // Token already invalid — no action needed
      }
    }
    return res.status(200).json({ success: true, message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

// ── Delete Account ────────────────────────────────────────

async function deleteAccount(req, res, next) {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }

    const user = await User.findById(req.user.userId).select('+password');
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(403).json({ success: false, error: 'Incorrect password.' });
    }

    user.isDeleted           = true;
    user.deletedAt           = new Date();
    user.refreshToken        = undefined;
    user.refreshTokenExpires = undefined;
    await user.save();

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── Forgot Password ───────────────────────────────────────

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    // Always return a generic response — never reveal if an email is registered
    const GENERIC_COOLDOWN = 60;

    if (!email || !validator.isEmail(email)) {
      return res.status(200).json({
        success:         true,
        message:         'If that email is registered, a reset code has been sent.',
        cooldownSeconds: GENERIC_COOLDOWN,
      });
    }

    const { cooldownSeconds } = await authService.requestPasswordReset(email.toLowerCase());

    return res.status(200).json({
      success:         true,
      message:         'If that email is registered, a reset code has been sent.',
      cooldownSeconds: cooldownSeconds || GENERIC_COOLDOWN,
    });
  } catch (err) {
    next(err);
  }
}

// ── Verify Reset Code ─────────────────────────────────────

async function verifyResetCode(req, res, next) {
  try {
    const { email, code } = req.body;
    await authService.verifyResetCode(email, code);
    return res.status(200).json({ success: true, message: 'Reset code verified.' });
  } catch (err) {
    if (err.statusCode) {
      const body = { success: false, error: err.message };
      if (err.retryAfterSeconds != null) body.retryAfterSeconds = err.retryAfterSeconds;
      if (err.attemptsLeft     != null) body.attemptsLeft     = err.attemptsLeft;
      return res.status(err.statusCode).json(body);
    }
    next(err);
  }
}

// ── Reset Password ────────────────────────────────────────

async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword } = req.body;
    await authService.resetPassword(email, code, newPassword);
    return res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    if (err.statusCode) {
      const body = { success: false, error: err.message };
      if (err.retryAfterSeconds != null) body.retryAfterSeconds = err.retryAfterSeconds;
      return res.status(err.statusCode).json(body);
    }
    next(err);
  }
}

// ── Resend Verification ───────────────────────────────────

async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;

    const GENERIC = {
      success: true,
      message: 'If that email is registered and unverified, a new code has been sent.',
    };

    if (!email || !validator.isEmail(email)) {
      return res.status(200).json({ ...GENERIC, cooldownSeconds: 60 });
    }

    const result = await authService.resendVerificationCode(email.toLowerCase());

    if (result.retryAfterSeconds) {
      return res.status(429).json({
        success:           false,
        error:             'Please wait before requesting another code.',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return res.status(200).json({ ...GENERIC, cooldownSeconds: result.cooldownSeconds });
  } catch (err) {
    next(err);
  }
}

// ── Resend Reset Code ─────────────────────────────────────

async function resendResetCode(req, res, next) {
  try {
    const { email } = req.body;

    const GENERIC = {
      success: true,
      message: 'If that email is registered, a new reset code has been sent.',
    };

    if (!email || !validator.isEmail(email)) {
      return res.status(200).json({ ...GENERIC, cooldownSeconds: 60 });
    }

    const result = await authService.resendResetCode(email.toLowerCase());

    if (result.retryAfterSeconds) {
      return res.status(429).json({
        success:           false,
        error:             'Please wait before requesting another code.',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return res.status(200).json({ ...GENERIC, cooldownSeconds: result.cooldownSeconds });
  } catch (err) {
    next(err);
  }
}

// ── Submit Feedback ───────────────────────────────────────

async function submitFeedback(req, res, next) {
  try {
    const { feedback } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    await authService.sendFeedbackEmail({
      name:     user.name,
      email:    user.email,
      feedback,
    });

    return res.status(200).json({ success: true, message: 'Feedback submitted successfully.' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    next(err);
  }
}

module.exports = {
  register,
  verifyEmail,
  login,
  getMe,
  refreshTokens,
  logoutHandler,
  deleteAccount,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  resendVerification,
  resendResetCode,
  submitFeedback,
};
