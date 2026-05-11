// src/middleware/rateLimit.js
// Two-tier rate limiting: global IP limit + per-user AI limit

import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

// Tier 1 — global: all endpoints, per IP
export const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED', retryAfter: '15 minutes' },
  handler: (req, res, next, options) => {
    logger.warn('rate_limit_hit', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

// Tier 2 — AI endpoints: stricter, per authenticated user
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      parseInt(process.env.AI_RATE_LIMIT_MAX || '30'),
  keyGenerator: (req) => req.user?.sub || req.ip, // per user, fall back to IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI request limit reached', code: 'AI_RATE_LIMITED', retryAfter: '1 hour' },
  handler: (req, res, next, options) => {
    logger.warn('ai_rate_limit_hit', { userId: req.user?.sub, ip: req.ip });
    res.status(429).json(options.message);
  },
});
