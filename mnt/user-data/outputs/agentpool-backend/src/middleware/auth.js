// src/middleware/auth.js
// JWT authentication + role-based access control
// Roles: owner | developer | reviewer | auditor

import jwt from 'jsonwebtoken';
import { audit } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET missing or too short. Set a 64-char hex string.');
  process.exit(1);
}

// Role hierarchy — higher index = more permissions
const ROLE_LEVELS = { auditor: 0, reviewer: 1, developer: 2, owner: 3 };

// Which roles can access AI endpoints
const AI_ENDPOINT_MIN_ROLE = 'developer';

export function generateToken(userId, role = 'developer', extra = {}) {
  return jwt.sign(
    { sub: userId, role, ...extra },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h', issuer: 'agentpool' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'agentpool' });
    req.user = payload;
    next();
  } catch (e) {
    audit('AUTH_FAILURE', null, { reason: e.message, ip: req.ip });
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(minRole) {
  return (req, res, next) => {
    const userLevel = ROLE_LEVELS[req.user?.role] ?? -1;
    const requiredLevel = ROLE_LEVELS[minRole] ?? 99;
    if (userLevel < requiredLevel) {
      audit('AUTHZ_FAILURE', req.user?.sub, {
        required: minRole, actual: req.user?.role, path: req.path,
      });
      return res.status(403).json({ error: `Requires role: ${minRole}` });
    }
    next();
  };
}

export function requireAI(req, res, next) {
  return requireRole(AI_ENDPOINT_MIN_ROLE)(req, res, next);
}

// Optional auth — sets req.user if token present, doesn't block if missing
export function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET, { issuer: 'agentpool' });
    } catch {}
  }
  next();
}
