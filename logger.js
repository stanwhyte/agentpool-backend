// src/utils/logger.js
// Structured logging — audit trail for SOC 2 CC7 compliance

import winston from 'winston';
import { fileURLToPath } from 'url';
import path from 'path';

const { combine, timestamp, printf, colorize, json } = winston.format;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../../logs');

// Human-readable format for console
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), json()),
  defaultMeta: { service: 'agentpool-backend' },
  transports: [
    // All logs — retained 90 days for SOC 2
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10_000_000, // 10MB
      maxFiles: 90,        // 90 days of daily files
      tailable: true,
    }),
    // Errors only
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10_000_000,
      maxFiles: 90,
    }),
    // Security audit log — never rotated, append only
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'audit.log'),
      level: 'info',
      maxsize: 50_000_000,
      maxFiles: 365,
    }),
  ],
});

// Console output in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
  }));
} else {
  // Production: also log to console for PM2 to capture
  logger.add(new winston.transports.Console({
    format: combine(timestamp(), json()),
  }));
}

// Audit helper — SOC 2 evidence
export function audit(event, userId, details = {}) {
  logger.info('AUDIT', {
    event,
    userId: userId || 'anonymous',
    timestamp: new Date().toISOString(),
    ...details,
  });
}

export default logger;
