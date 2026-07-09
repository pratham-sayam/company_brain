'use strict';

const usageService = require('../services/usageService');

// ── GET /api/v1/usage — full usage summary for Settings page ─

async function getUsage(req, res, next) {
  try {
    const summary = await usageService.getUsageSummary(req.user.userId);
    return res.status(200).json({ success: true, usage: summary });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/v1/usage/check-files — pre-check file capacity ─

async function checkFiles(req, res, next) {
  try {
    const count = parseInt(req.query.count, 10) || 1;

    if (count < 1 || count > 500) {
      return res.status(400).json({
        success: false,
        error: 'count must be between 1 and 500.',
      });
    }

    const result = await usageService.checkFileLimit(req.user.userId, count);

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsage, checkFiles };
