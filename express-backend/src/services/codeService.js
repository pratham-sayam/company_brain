'use strict';

const crypto = require('crypto');

// ── Policy constants ───────────────────────────────────────

const CODE_EXPIRY_MINUTES          = 10;
const CODE_MAX_ATTEMPTS            = 5;
const CODE_LOCK_MINUTES            = 15;
const CODE_RESEND_COOLDOWN_SECONDS = 60;
const CODE_MAX_RESENDS_PER_HOUR    = 5;

// ── Field maps ─────────────────────────────────────────────

function getFields(type) {
  if (type === 'verification') {
    return {
      codeHash:          'emailVerificationCodeHash',
      issuedAt:          'emailVerificationIssuedAt',
      expires:           'emailVerificationExpires',
      attempts:          'emailVerificationAttempts',
      lockedUntil:       'emailVerificationLockedUntil',
      resendAvailableAt: 'emailVerificationResendAvailableAt',
      resendCount:       'emailVerificationResendCount',
      resendWindowStart: 'emailVerificationResendWindowStart',
    };
  }
  if (type === 'reset') {
    return {
      codeHash:          'passwordResetCodeHash',
      issuedAt:          'passwordResetIssuedAt',
      expires:           'passwordResetExpires',
      attempts:          'passwordResetAttempts',
      lockedUntil:       'passwordResetLockedUntil',
      resendAvailableAt: 'passwordResetResendAvailableAt',
      resendCount:       'passwordResetResendCount',
      resendWindowStart: 'passwordResetResendWindowStart',
    };
  }
  throw new Error(`Unknown code type: ${type}`);
}

// ── Primitive helpers ──────────────────────────────────────

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

function hashCode(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

// ── Issue ──────────────────────────────────────────────────

/**
 * Issue a brand-new code (first issuance — resets resend window).
 * Modifies user in place. Caller must save().
 * @returns {{ code: string, cooldownSeconds: number }}
 */
function issueCodeFresh(user, type) {
  const f   = getFields(type);
  const now = Date.now();
  const code = generateCode();

  user[f.codeHash]          = hashCode(code);
  user[f.issuedAt]          = new Date(now);
  user[f.expires]           = new Date(now + CODE_EXPIRY_MINUTES * 60 * 1000);
  user[f.attempts]          = 0;
  user[f.lockedUntil]       = undefined;
  user[f.resendAvailableAt] = new Date(now + CODE_RESEND_COOLDOWN_SECONDS * 1000);
  user[f.resendCount]       = 0;
  user[f.resendWindowStart] = new Date(now);

  return { code, cooldownSeconds: CODE_RESEND_COOLDOWN_SECONDS };
}

/**
 * Issue a replacement code (resend). Caller must call checkResend() first.
 * Modifies user in place. Caller must save().
 * @returns {{ code: string, cooldownSeconds: number }}
 */
function issueReplacementCode(user, type) {
  const f   = getFields(type);
  const now = Date.now();
  const code = generateCode();

  user[f.codeHash]          = hashCode(code);
  user[f.issuedAt]          = new Date(now);
  user[f.expires]           = new Date(now + CODE_EXPIRY_MINUTES * 60 * 1000);
  user[f.attempts]          = 0;
  user[f.lockedUntil]       = undefined;
  user[f.resendAvailableAt] = new Date(now + CODE_RESEND_COOLDOWN_SECONDS * 1000);

  // Manage rolling resend window
  const windowStart = user[f.resendWindowStart] ? user[f.resendWindowStart].getTime() : 0;
  const hourAgo     = now - 60 * 60 * 1000;
  if (windowStart <= hourAgo) {
    user[f.resendWindowStart] = new Date(now);
    user[f.resendCount]       = 1;
  } else {
    user[f.resendCount] = (user[f.resendCount] || 0) + 1;
  }

  return { code, cooldownSeconds: CODE_RESEND_COOLDOWN_SECONDS };
}

// ── Resend gate ────────────────────────────────────────────

/**
 * Check whether a resend is currently allowed.
 * @returns {{ allowed: boolean, retryAfterSeconds?: number }}
 */
function checkResend(user, type) {
  const f   = getFields(type);
  const now = Date.now();

  // 60-second cooldown between consecutive resends
  if (user[f.resendAvailableAt] && user[f.resendAvailableAt].getTime() > now) {
    const retryAfterSeconds = Math.ceil((user[f.resendAvailableAt].getTime() - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  // 5-per-hour rolling cap
  const windowStart = user[f.resendWindowStart] ? user[f.resendWindowStart].getTime() : 0;
  const hourAgo     = now - 60 * 60 * 1000;
  if (windowStart > hourAgo && (user[f.resendCount] || 0) >= CODE_MAX_RESENDS_PER_HOUR) {
    const retryAfterSeconds = Math.ceil((windowStart + 60 * 60 * 1000 - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

// ── Verify ─────────────────────────────────────────────────

/**
 * Verify user input against the stored code hash.
 * Modifies user in place (increments attempts / applies lock) on failure. Caller must save().
 * @returns {{ valid: boolean, locked?: boolean, justLocked?: boolean, expired?: boolean,
 *             noCode?: boolean, attemptsLeft?: number, retryAfterSeconds?: number }}
 */
function verifyCode(user, type, input) {
  const f   = getFields(type);
  const now = Date.now();

  // Already locked?
  if (user[f.lockedUntil] && user[f.lockedUntil].getTime() > now) {
    const retryAfterSeconds = Math.ceil((user[f.lockedUntil].getTime() - now) / 1000);
    return { valid: false, locked: true, retryAfterSeconds };
  }

  // No code stored
  if (!user[f.codeHash]) {
    return { valid: false, noCode: true };
  }

  // Code expired
  if (!user[f.expires] || user[f.expires].getTime() < now) {
    return { valid: false, expired: true };
  }

  // Hash comparison
  if (hashCode(input) !== user[f.codeHash]) {
    user[f.attempts] = (user[f.attempts] || 0) + 1;
    if (user[f.attempts] >= CODE_MAX_ATTEMPTS) {
      user[f.lockedUntil] = new Date(now + CODE_LOCK_MINUTES * 60 * 1000);
      return {
        valid: false,
        locked: true,
        justLocked: true,
        retryAfterSeconds: CODE_LOCK_MINUTES * 60,
      };
    }
    return { valid: false, attemptsLeft: CODE_MAX_ATTEMPTS - user[f.attempts] };
  }

  return { valid: true };
}

// ── Invalidate ─────────────────────────────────────────────

/**
 * Clear all code state for a type after successful use.
 * Modifies user in place. Caller must save().
 */
function invalidateCode(user, type) {
  const f = getFields(type);
  user[f.codeHash]          = undefined;
  user[f.issuedAt]          = undefined;
  user[f.expires]           = undefined;
  user[f.attempts]          = 0;
  user[f.lockedUntil]       = undefined;
  user[f.resendAvailableAt] = undefined;
  user[f.resendCount]       = 0;
  user[f.resendWindowStart] = undefined;
}

module.exports = {
  generateCode,
  hashCode,
  issueCodeFresh,
  issueReplacementCode,
  checkResend,
  verifyCode,
  invalidateCode,
  CODE_EXPIRY_MINUTES,
  CODE_MAX_ATTEMPTS,
  CODE_LOCK_MINUTES,
  CODE_RESEND_COOLDOWN_SECONDS,
  CODE_MAX_RESENDS_PER_HOUR,
};
