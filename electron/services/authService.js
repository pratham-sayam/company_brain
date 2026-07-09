/**
 * Auth Service — runs exclusively in the Electron main process.
 *
 * Responsibilities:
 *   - Make HTTP requests to the Express auth backend.
 *   - Hold the ACCESS token in main-process memory only.
 *   - Never expose any token to the renderer process.
 *
 * Token model:
 *   - Access token  → 15-minute JWT, lives only in _token (memory)
 *   - Refresh token → 7-day JWT, stored encrypted in tokenVault by callers
 */

const config = require('../config');

let _token = null;   // Access token — in-process memory only
let _user  = null;

function getExpressUrl() {
  return config.EXPRESS_URL;
}

// ── Registration ──────────────────────────────────────────

async function register({ name, email, password }) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed.');
  return data;
}

// ── Login ─────────────────────────────────────────────────

/**
 * Authenticates against Express. Stores the access token in memory.
 *
 * @returns {{ user: object, refreshToken: string }}
 *   user         — sanitized user object (no password, no tokens)
 *   refreshToken — plain JWT; caller must store it in tokenVault
 */
async function login({ email, password }) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed.');

  // Access token stored in memory only — never leaves the main process
  _token = data.accessToken;
  _user  = data.user;

  return { user: _user, refreshToken: data.refreshToken };
}

// ── Token Refresh ─────────────────────────────────────────

/**
 * Exchanges a refresh token for a new access + refresh token pair.
 * Rotates the refresh token — the old one is invalidated server-side.
 * Updates the in-memory access token on success.
 *
 * @param {string} refreshToken - The stored refresh JWT
 * @returns {{ accessToken: string, refreshToken: string, user: object }}
 * @throws {Error} On network failure or if the refresh token is rejected
 */
async function refreshTokens(refreshToken) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Token refresh failed.');

  // Update in-memory access token with the newly issued one
  _token = data.accessToken;
  _user  = data.user;

  return {
    accessToken:  data.accessToken,
    refreshToken: data.refreshToken,
    user:         data.user,
  };
}

// ── Server-Side Revocation ────────────────────────────────

/**
 * Asks Express to invalidate the refresh token in MongoDB.
 * Best-effort — a network failure does not prevent local logout.
 *
 * @param {string} refreshToken - The refresh JWT to revoke
 */
async function revokeRefreshToken(refreshToken) {
  try {
    await fetch(`${getExpressUrl()}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Intentionally swallowed. The local session is cleared regardless.
  }
}

// ── Session Restore ───────────────────────────────────────

/**
 * Validates a stored access token against /api/v1/auth/me.
 * Used as a guard check where the refresh flow is not applicable.
 *
 * @param {string} token - Access JWT
 * @returns {Promise<object>} Sanitized user object
 */
async function validateToken(token) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Token validation failed.');
  return data.user;
}

/**
 * Restores in-memory session state without an HTTP call.
 * Used after a successful token refresh during startup restore.
 *
 * @param {string} accessToken - The newly issued access JWT
 * @param {object} user        - Sanitized user object from Express
 */
function setSession(accessToken, user) {
  _token = accessToken;
  _user  = user;
}

// ── Email Verification ────────────────────────────────────

async function verifyEmail(email, code) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Email verification failed.');
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.attemptsLeft      = data.attemptsLeft;
    throw err;
  }
  return data;
}

// ── Resend Verification ───────────────────────────────────

async function resendVerification(email) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Resend failed.');
  return data;
}

// ── Forgot Password ───────────────────────────────────────

async function forgotPassword(email) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// ── Verify Reset Code ─────────────────────────────────────

async function verifyResetCode(email, code) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/verify-reset-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Reset code verification failed.');
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.attemptsLeft      = data.attemptsLeft;
    throw err;
  }
  return data;
}

// ── Reset Password (code-based) ───────────────────────────

async function resetPassword({ email, code, newPassword }) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Password reset failed.');
    err.retryAfterSeconds = data.retryAfterSeconds;
    throw err;
  }
  return data;
}

// ── Resend Reset Code ─────────────────────────────────────

async function resendResetCode(email) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/resend-reset-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Resend failed.');
  return data;
}

// ── Delete Account ────────────────────────────────────────

async function deleteAccount({ password }) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/delete-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${_token}`,
    },
    body: JSON.stringify({ password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Account deletion failed.');
  return data;
}

// ── Logout ────────────────────────────────────────────────

function logout() {
  _token = null;
  _user  = null;
}

// ── Accessors ─────────────────────────────────────────────

function getCurrentUser() { return _user; }

// Returns the access token for use by other Electron services only.
// Never passed to the renderer.
function getToken() { return _token; }

// ── Send Feedback ────────────────────────────────────────

async function sendFeedback({ feedback }) {
  const res = await fetch(`${getExpressUrl()}/api/v1/auth/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${_token}`,
    },
    body: JSON.stringify({ feedback }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send feedback.');
  return data;
}

module.exports = {
  register,
  login,
  refreshTokens,
  revokeRefreshToken,
  validateToken,
  setSession,
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  resendResetCode,
  deleteAccount,
  sendFeedback,
  logout,
  getCurrentUser,
  getToken,
};
