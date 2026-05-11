// src/index.js
// AgentPool Backend — main entry point
// Loads env → applies security middleware → mounts routes → starts server

import 'dotenv/config';
import { readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import logger from './utils/logger.js';
import { globalLimiter } from './middleware/rateLimit.js';

import agentRoutes  from './routes/agent.js';
import authRoutes   from './routes/auth.js';
import githubRoutes from './routes/github.js';
import notifyRoutes from './routes/notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Ensure log directory exists ───────────────────────────────────────────────
mkdirSync(path.join(__dirname, '../logs'), { recursive: true });

// ── Validate critical env vars on startup ────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'ALLOWED_ORIGINS'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  logger.error('Missing required environment variables', { missing });
  process.exit(1);
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow SSE
}));

// CORS — only allow listed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || [];
app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin (server-to-server) and listed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked', { origin });
      callback(new Error(`Origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Body parsing — limit to 1MB to prevent abuse
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// HTTP request logging (skip in test)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: msg => logger.info(msg.trim()) },
    skip: (req) => req.path === '/health', // don't log health checks
  }));
}

// Global rate limiting
app.use(globalLimiter);

// Trust proxy (needed behind Nginx on DO)
app.set('trust proxy', 1);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/agent',  agentRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/notify', notifyRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
    providers: {
      anthropic:  !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('REPLACE_ME'),
      openai:     !!process.env.OPENAI_API_KEY    && !process.env.OPENAI_API_KEY.includes('REPLACE_ME'),
      perplexity: !!process.env.PERPLEXITY_API_KEY && !process.env.PERPLEXITY_API_KEY.includes('REPLACE_ME'),
      google:     !!process.env.GOOGLE_API_KEY    && !process.env.GOOGLE_API_KEY.includes('REPLACE_ME'),
      groq:       !!process.env.GROQ_API_KEY      && !process.env.GROQ_API_KEY.includes('REPLACE_ME'),
      github:     !!process.env.GITHUB_TOKEN      && !process.env.GITHUB_TOKEN.includes('REPLACE_ME'),
    },
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('unhandled_error', { error: err.message, stack: err.stack, path: req.path });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001');
app.listen(PORT, () => {
  logger.info(`AgentPool backend started`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    origins: allowedOrigins,
  });
  console.log(`\n🚀 AgentPool backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

export default app;
