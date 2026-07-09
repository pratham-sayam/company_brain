require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./services/logger');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const aiRouter   = require('./routes/ai');
const usageRouter = require('./routes/usage');

// ── Fail fast on missing required environment variables ───
const REQUIRED_ENV = ['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'MONGO_URI', 'GEMINI_API_KEY'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// ── SMTP warning (non-fatal; dev uses file-log fallback) ──
const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
const missingSmtp = SMTP_VARS.filter((key) => !process.env[key]);
if (missingSmtp.length > 0) {
  logger.warn(
    `SMTP not fully configured (${missingSmtp.join(', ')} missing). ` +
    'Emails will be logged to file instead of sent. Configure all SMTP_* vars for production.'
  );
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(helmet());
const corsOptions = {
  origin: function (origin, callback) {
    // Desktop app (Electron main process) sends no Origin header — allow it.
    // Safe because all sensitive endpoints require Bearer token auth.
    if (!origin) return callback(null, true);
    const allowed = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : [];
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

// HTTP request logging — piped through winston in all environments.
// In dev: morgan 'dev' format to console + file. In prod: 'combined' to file only.
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, { stream: logger.morganStream }));

// ── Routes (v1) ──────────────────────────────────────────
// All API routes are versioned under /api/v1/ to support future
// breaking changes without disrupting existing clients.
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/usage', usageRouter);

// ── Backward-compat aliases (unversioned → v1) ───────────
// Keeps existing Electron builds working until they update to /api/v1/.
// Remove these once all clients are confirmed on v1.
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/usage', usageRouter);

// ── 404 handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found.' });
});

// ── Global error handler ──────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`Express running on port ${PORT}`);
  });
});
