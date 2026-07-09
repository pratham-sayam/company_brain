'use strict';

const User           = require('../models/User');
const UserUsage      = require('../models/UserUsage');
const UserLimits     = require('../models/UserLimits');
const IdempotencyKey = require('../models/IdempotencyKey');
const logger         = require('./logger');

// ── Constants ──────────────────────────────────────────────

const FILE_PERIOD_MS   = 30 * 24 * 60 * 60 * 1000;  // 30 days
const MESSAGE_PERIOD_MS = 24 * 60 * 60 * 1000;       // 1 day

const DEFAULT_FILE_LIMIT    = 500;
const DEFAULT_MESSAGE_LIMIT = 25;

// ── Lazy initialization helpers ────────────────────────────

/**
 * Returns the UserUsage doc for a user, creating one if it doesn't exist.
 * Initial period dates are set to the user's profile creation time.
 */
async function getOrCreateUsage(userId) {
  let usage = await UserUsage.findOne({ userId });
  if (usage) return usage;

  // Fetch user's createdAt for initial period anchoring
  const user = await User.findById(userId).select('createdAt');
  const anchor = user?.createdAt || new Date();

  usage = await UserUsage.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        filesUploadedThisPeriod: 0,
        messagesToday: 0,
        filePeriodStart: anchor,
        messageDayStart: anchor,
      },
    },
    { upsert: true, new: true }
  );

  return usage;
}

/**
 * Returns the UserLimits doc for a user, creating one with defaults if missing.
 */
async function getOrCreateLimits(userId) {
  let limits = await UserLimits.findOne({ userId });
  if (limits) return limits;

  limits = await UserLimits.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        monthlyFileLimit: DEFAULT_FILE_LIMIT,
        dailyMessageLimit: DEFAULT_MESSAGE_LIMIT,
      },
    },
    { upsert: true, new: true }
  );

  return limits;
}

// ── Period reset logic (loop-based for missed periods) ─────

/**
 * Advances period start dates and resets counters if one or more periods
 * have elapsed. Handles users who were inactive for many periods.
 * Saves the document if changes were made.
 *
 * @param {Document} usage - Mongoose UserUsage document
 * @returns {Document} The (possibly updated) usage document
 */
async function resetExpiredPeriods(usage) {
  const now = Date.now();
  let dirty = false;

  // File period — rolling 30-day window
  while (now >= usage.filePeriodStart.getTime() + FILE_PERIOD_MS) {
    usage.filePeriodStart = new Date(usage.filePeriodStart.getTime() + FILE_PERIOD_MS);
    usage.filesUploadedThisPeriod = 0;
    dirty = true;
  }

  // Message period — rolling 24-hour window
  while (now >= usage.messageDayStart.getTime() + MESSAGE_PERIOD_MS) {
    usage.messageDayStart = new Date(usage.messageDayStart.getTime() + MESSAGE_PERIOD_MS);
    usage.messagesToday = 0;
    dirty = true;
  }

  if (dirty) {
    await usage.save();
  }

  return usage;
}

// ── Check helpers ──────────────────────────────────────────

/**
 * Check whether the user can upload `count` more files this period.
 * Does NOT modify anything — read-only pre-check.
 *
 * @returns {{ allowed, current, limit, remaining, resetsAt }}
 */
async function checkFileLimit(userId, count = 1) {
  const [usage, limits] = await Promise.all([
    getOrCreateUsage(userId),
    getOrCreateLimits(userId),
  ]);

  await resetExpiredPeriods(usage);

  const current   = usage.filesUploadedThisPeriod;
  const limit     = limits.monthlyFileLimit;
  const remaining = Math.max(0, limit - current);
  const resetsAt  = new Date(usage.filePeriodStart.getTime() + FILE_PERIOD_MS);

  return {
    allowed: remaining >= count,
    current,
    limit,
    remaining,
    resetsAt,
  };
}

/**
 * Check whether the user can send another copilot message today.
 * Does NOT modify anything — read-only pre-check.
 *
 * @returns {{ allowed, current, limit, remaining, resetsAt }}
 */
async function checkMessageLimit(userId) {
  const [usage, limits] = await Promise.all([
    getOrCreateUsage(userId),
    getOrCreateLimits(userId),
  ]);

  await resetExpiredPeriods(usage);

  const current   = usage.messagesToday;
  const limit     = limits.dailyMessageLimit;
  const remaining = Math.max(0, limit - current);
  const resetsAt  = new Date(usage.messageDayStart.getTime() + MESSAGE_PERIOD_MS);

  return {
    allowed: remaining > 0,
    current,
    limit,
    remaining,
    resetsAt,
  };
}

// ── Reservation pattern for files ──────────────────────────

/**
 * Reserve file capacity atomically. Used at the START of classification
 * to prevent concurrent bypass. Roll back with rollbackFiles() if
 * classification (Gemini) fails.
 *
 * @param {string} userId
 * @param {number} count     - Number of files to reserve
 * @param {string} requestId - Idempotency key from Electron
 * @returns {{ reserved: boolean, idempotent: boolean, current?, limit?, remaining?, resetsAt? }}
 */
async function reserveFiles(userId, count, requestId) {
  // 1. Idempotency check — already processed this request?
  if (requestId) {
    const existing = await IdempotencyKey.findOne({ key: requestId });
    if (existing) {
      logger.info(`[usage] idempotent file reservation: ${requestId}`);
      return { reserved: false, idempotent: true };
    }
  }

  // 2. Ensure usage doc exists and periods are reset
  const usage = await getOrCreateUsage(userId);
  await resetExpiredPeriods(usage);

  const limits = await getOrCreateLimits(userId);
  const maxAllowed = limits.monthlyFileLimit;

  // 3. Atomic conditional increment — only if under limit
  const result = await UserUsage.findOneAndUpdate(
    {
      userId,
      filesUploadedThisPeriod: { $lte: maxAllowed - count },
    },
    { $inc: { filesUploadedThisPeriod: count } },
    { new: true }
  );

  if (!result) {
    // Limit exceeded — re-read for accurate numbers
    const freshUsage = await UserUsage.findOne({ userId });
    const current   = freshUsage?.filesUploadedThisPeriod || 0;
    const remaining = Math.max(0, maxAllowed - current);
    const resetsAt  = new Date(
      (freshUsage?.filePeriodStart || new Date()).getTime() + FILE_PERIOD_MS
    );
    return {
      reserved: false,
      idempotent: false,
      current,
      limit: maxAllowed,
      remaining,
      resetsAt,
    };
  }

  // 4. Store idempotency key
  if (requestId) {
    try {
      await IdempotencyKey.create({
        key: requestId,
        userId,
        action: 'classify',
        count,
      });
    } catch (err) {
      // Duplicate key race — safe to ignore
      logger.warn(`[usage] idempotency key store failed: ${err.message}`);
    }
  }

  return { reserved: true, idempotent: false };
}

/**
 * Roll back a file reservation when classification fails.
 * Also removes the idempotency key so retries can work.
 */
async function rollbackFiles(userId, count, requestId) {
  try {
    await UserUsage.findOneAndUpdate(
      { userId },
      { $inc: { filesUploadedThisPeriod: -count } }
    );

    // Ensure counter doesn't go negative
    await UserUsage.findOneAndUpdate(
      { userId, filesUploadedThisPeriod: { $lt: 0 } },
      { $set: { filesUploadedThisPeriod: 0 } }
    );

    if (requestId) {
      await IdempotencyKey.deleteOne({ key: requestId });
    }

    logger.info(`[usage] rolled back ${count} file(s) for user ${userId}`);
  } catch (err) {
    logger.error(`[usage] rollback failed: ${err.message}`);
  }
}

// ── Copilot message increment ──────────────────────────────

/**
 * Atomically increment the message counter. Called BEFORE the LLM call
 * so compute is always charged. Uses idempotency to prevent double-count.
 *
 * @param {string} userId
 * @param {string} requestId - Idempotency key from Electron
 * @returns {{ incremented: boolean, idempotent: boolean }}
 */
async function incrementMessages(userId, requestId) {
  // 1. Idempotency check
  if (requestId) {
    const existing = await IdempotencyKey.findOne({ key: requestId });
    if (existing) {
      logger.info(`[usage] idempotent message increment: ${requestId}`);
      return { incremented: false, idempotent: true };
    }
  }

  // 2. Ensure usage exists and periods are reset
  const usage = await getOrCreateUsage(userId);
  await resetExpiredPeriods(usage);

  // 3. Atomic increment
  await UserUsage.findOneAndUpdate(
    { userId },
    { $inc: { messagesToday: 1 } }
  );

  // 4. Store idempotency key
  if (requestId) {
    try {
      await IdempotencyKey.create({
        key: requestId,
        userId,
        action: 'chat',
        count: 1,
      });
    } catch (err) {
      logger.warn(`[usage] idempotency key store failed: ${err.message}`);
    }
  }

  return { incremented: true, idempotent: false };
}

// ── Full usage summary (for Settings page) ─────────────────

/**
 * Returns a complete usage summary for the authenticated user.
 *
 * @returns {{ files: { used, limit, remaining, resetsAt }, messages: { used, limit, remaining, resetsAt } }}
 */
async function getUsageSummary(userId) {
  const [usage, limits] = await Promise.all([
    getOrCreateUsage(userId),
    getOrCreateLimits(userId),
  ]);

  await resetExpiredPeriods(usage);

  const fileRemaining = Math.max(0, limits.monthlyFileLimit - usage.filesUploadedThisPeriod);
  const msgRemaining  = Math.max(0, limits.dailyMessageLimit - usage.messagesToday);

  return {
    files: {
      used:      usage.filesUploadedThisPeriod,
      limit:     limits.monthlyFileLimit,
      remaining: fileRemaining,
      resetsAt:  new Date(usage.filePeriodStart.getTime() + FILE_PERIOD_MS),
    },
    messages: {
      used:      usage.messagesToday,
      limit:     limits.dailyMessageLimit,
      remaining: msgRemaining,
      resetsAt:  new Date(usage.messageDayStart.getTime() + MESSAGE_PERIOD_MS),
    },
  };
}

module.exports = {
  checkFileLimit,
  checkMessageLimit,
  reserveFiles,
  rollbackFiles,
  incrementMessages,
  getUsageSummary,
};
