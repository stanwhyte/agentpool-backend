// src/routes/auth.js
// POST /api/auth/login   — username + password → JWT
// POST /api/auth/refresh — refresh token → new JWT
// GET  /api/auth/me      — current user info
// POST /api/auth/users   — create team member (owner only)

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { generateToken, requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/logger.js';
import logger from '../utils/logger.js';

const router = Router();

// ── In-memory user store ──────────────────────────────────────────────────────
// For production: replace with PostgreSQL users table
// Schema: { id, username, passwordHash, role, createdAt, lastLogin }
const users = new Map();

// Bootstrap owner account from env on startup
async function seedOwner() {
  const username = process.env.OWNER_USERNAME || 'admin';
  const password = process.env.OWNER_PASSWORD;
  if (!password || password === 'REPLACE_ME') {
    logger.warn('OWNER_PASSWORD not set — add it to .env to enable login');
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  users.set(username, {
    id: 'owner-1',
    username,
    passwordHash: hash,
    role: 'owner',
    createdAt: new Date().toISOString(),
    lastLogin: null,
  });
  logger.info('Owner account ready', { username });
}
seedOwner();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const user = users.get(username);
  if (!user) {
    audit('LOGIN_FAIL', null, { username, reason: 'user not found', ip: req.ip });
    // Timing-safe: still hash even when user not found
    await bcrypt.hash(password, 12);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    audit('LOGIN_FAIL', user.id, { username, reason: 'wrong password', ip: req.ip });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  user.lastLogin = new Date().toISOString();
  const token = generateToken(user.id, user.role, { username: user.username });

  audit('LOGIN_SUCCESS', user.id, { username, role: user.role, ip: req.ip });

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, username: req.user.username, role: req.user.role });
});

// ── POST /api/auth/users — create team member (owner only) ───────────────────
router.post('/users', requireAuth, requireRole('owner'), async (req, res) => {
  const { username, password, role } = req.body;
  const validRoles = ['owner', 'developer', 'reviewer', 'auditor'];

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password, role required' });
  }
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }
  if (users.has(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }

  const hash = await bcrypt.hash(password, 12);
  const id = `user-${Date.now()}`;
  users.set(username, { id, username, passwordHash: hash, role, createdAt: new Date().toISOString(), lastLogin: null });

  audit('USER_CREATED', req.user.sub, { newUsername: username, role });

  res.status(201).json({ id, username, role, message: 'User created' });
});

// ── GET /api/auth/users — list team (owner only) ──────────────────────────────
router.get('/users', requireAuth, requireRole('owner'), (req, res) => {
  const list = [...users.values()].map(u => ({
    id: u.id, username: u.username, role: u.role,
    createdAt: u.createdAt, lastLogin: u.lastLogin,
  }));
  res.json(list);
});

// ── DELETE /api/auth/users/:username ─────────────────────────────────────────
router.delete('/users/:username', requireAuth, requireRole('owner'), (req, res) => {
  const { username } = req.params;
  if (username === req.user.username) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  if (!users.has(username)) {
    return res.status(404).json({ error: 'User not found' });
  }
  users.delete(username);
  audit('USER_DELETED', req.user.sub, { deletedUsername: username });
  res.json({ message: 'User deleted' });
});

export default router;
