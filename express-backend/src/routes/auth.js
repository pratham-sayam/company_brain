const { Router } = require('express');
const {
  register,
  verifyEmail,
  login,
  getMe,
  refreshTokens,
  logoutHandler,
  deleteAccount,
  resendVerification,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  resendResetCode,
  submitFeedback,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/authenticate');
const {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  resendVerificationLimiter,
  registerLimiter,
  verifyResetCodeLimiter,
  resendResetCodeLimiter,
  feedbackLimiter,
} = require('../middleware/rateLimiter');

const router = Router();

router.post('/register',           registerLimiter,          register);
router.post('/verify-email',                                  verifyEmail);
router.post('/login',              loginLimiter,             login);

// Stateless access-token validation — used by Electron for guard checks.
router.get('/me',                  authenticate,             getMe);

// Rotate refresh token → issue new access + refresh tokens.
// No auth middleware — accepts a refresh token in the body.
router.post('/refresh',                                       refreshTokens);

// Server-side refresh-token revocation. No auth middleware required —
// accepts the refresh token in the body (access token may already be expired).
router.post('/logout',                                        logoutHandler);
router.post('/delete-account',     authenticate,             deleteAccount);
router.post('/resend-verification',resendVerificationLimiter, resendVerification);

// Password reset (code-based, in-app flow)
router.post('/forgot-password',    forgotPasswordLimiter,    forgotPassword);
router.post('/verify-reset-code',  verifyResetCodeLimiter,   verifyResetCode);
router.post('/reset-password',     resetPasswordLimiter,     resetPassword);
router.post('/resend-reset-code',  resendResetCodeLimiter,   resendResetCode);

// Feedback
router.post('/feedback',          authenticate, feedbackLimiter, submitFeedback);

module.exports = router;
