// src/routes/agent.js
// POST /api/agent — streams AI responses back to frontend
// Handles all providers via unified interface

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireAI } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { streamProvider } from '../providers/index.js';
import {
  checkBudget, recordSpend, estimateCost, estimateTokens, getBudgetStatus
} from '../utils/budget.js';
import { audit } from '../utils/logger.js';
import logger from '../utils/logger.js';

const router = Router();

// ── POST /api/agent ───────────────────────────────────────────────────────────
// Body: { model, system, messages, agentId, sessionId }
// Returns: SSE stream of { text } chunks, ending with [DONE]
router.post('/', requireAuth, requireAI, aiLimiter, async (req, res) => {
  const { model, system, messages, agentId, sessionId } = req.body;

  // Validate input
  if (!model || !system || !messages?.length) {
    return res.status(400).json({ error: 'model, system, and messages are required' });
  }

  const reqId = uuidv4();
  const sid = sessionId || uuidv4();

  // Pre-flight budget check (estimate)
  const estimatedInputTokens  = estimateTokens(system) + messages.reduce((s,m) => s + estimateTokens(m.content), 0);
  const estimatedOutputTokens = 800; // conservative estimate
  const estimatedCost = estimateCost(model, estimatedInputTokens, estimatedOutputTokens);

  const budgetCheck = checkBudget(sid, estimatedCost);
  if (!budgetCheck.allowed) {
    audit('BUDGET_BLOCKED', req.user.sub, { reason: budgetCheck.reason, model, agentId });
    return res.status(402).json({ error: budgetCheck.reason, code: budgetCheck.code });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Request-ID', reqId);
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Handle client disconnect
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  audit('AGENT_REQUEST', req.user.sub, { reqId, model, agentId, sessionId: sid });

  let totalChars = 0;
  const startTime = Date.now();

  try {
    await streamProvider({
      model, system, messages,
      maxTokens: 1000,
      signal: controller.signal,
      onChunk: (text) => {
        totalChars += text.length;
        sendEvent({ text });
      },
      onDone: ({ totalChars: tc }) => {
        const actualOutputTokens = Math.ceil(tc / 4);
        const actualCost = estimateCost(model, estimatedInputTokens, actualOutputTokens);
        recordSpend(sid, actualCost);

        const duration = Date.now() - startTime;
        audit('AGENT_COMPLETE', req.user.sub, {
          reqId, model, agentId, sessionId: sid,
          outputTokens: actualOutputTokens,
          inputTokens: estimatedInputTokens,
          cost: actualCost,
          durationMs: duration,
        });
      },
    });

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.info('agent_stream_aborted', { reqId, agentId });
      res.end();
      return;
    }
    logger.error('agent_stream_error', { reqId, agentId, model, error: err.message });
    sendEvent({ error: err.message });
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// ── GET /api/agent/budget ─────────────────────────────────────────────────────
router.get('/budget', requireAuth, (req, res) => {
  res.json(getBudgetStatus());
});

export default router;
