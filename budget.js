// src/utils/budget.js
// Server-side budget enforcement — prevents runaway API costs
// Resets monthly. Persists in memory (upgrade to Redis for multi-instance)

import logger from './logger.js';

const SESSION_BUDGET  = parseFloat(process.env.SESSION_BUDGET_USD  || '2.00');
const MONTHLY_BUDGET  = parseFloat(process.env.MONTHLY_BUDGET_USD  || '50.00');

// Cost per 1M tokens: [input, output]
const MODEL_COSTS = {
  // Anthropic
  'claude-sonnet-4-20250514':    [3.00,  15.00],
  'claude-haiku-4-5-20251001':   [0.80,   4.00],
  // OpenAI
  'gpt-4o':                      [2.50,  10.00],
  'gpt-4o-mini':                 [0.15,   0.60],
  // Google
  'gemini-1.5-flash':            [0.075,  0.30],
  'gemini-1.5-pro':              [1.25,   5.00],
  // Perplexity
  'llama-3.1-sonar-large-128k-online': [1.00, 1.00],
  // Groq (free)
  'llama-3.3-70b-versatile':     [0.00,   0.00],
};

// In-memory store — reset monthly
let monthlySpend = 0;
let monthlyResetAt = startOfMonth();
const sessionSpend = new Map(); // sessionId → USD

function startOfMonth() {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function checkMonthlyReset() {
  if (Date.now() - monthlyResetAt >= 30 * 24 * 60 * 60 * 1000) {
    logger.info('Monthly budget reset', { previousSpend: monthlySpend });
    monthlySpend = 0;
    monthlyResetAt = startOfMonth();
  }
}

export function estimateCost(model, inputTokens, outputTokens) {
  const costs = MODEL_COSTS[model] || [3.00, 15.00]; // default to Sonnet pricing
  return (inputTokens / 1_000_000) * costs[0] + (outputTokens / 1_000_000) * costs[1];
}

export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

export function checkBudget(sessionId, estimatedCost) {
  checkMonthlyReset();

  const sessionTotal = (sessionSpend.get(sessionId) || 0) + estimatedCost;
  if (sessionTotal > SESSION_BUDGET) {
    return {
      allowed: false,
      reason: `Session budget exceeded ($${SESSION_BUDGET.toFixed(2)} limit, ~$${sessionTotal.toFixed(4)} estimated)`,
      code: 'SESSION_BUDGET_EXCEEDED',
    };
  }

  if (monthlySpend + estimatedCost > MONTHLY_BUDGET) {
    return {
      allowed: false,
      reason: `Monthly budget exceeded ($${MONTHLY_BUDGET.toFixed(2)} limit, $${monthlySpend.toFixed(4)} spent)`,
      code: 'MONTHLY_BUDGET_EXCEEDED',
    };
  }

  return { allowed: true };
}

export function recordSpend(sessionId, actualCost) {
  checkMonthlyReset();
  const current = sessionSpend.get(sessionId) || 0;
  sessionSpend.set(sessionId, current + actualCost);
  monthlySpend += actualCost;

  logger.info('spend_recorded', {
    sessionId,
    actualCost,
    sessionTotal: sessionSpend.get(sessionId),
    monthlyTotal: monthlySpend,
  });
}

export function getBudgetStatus() {
  checkMonthlyReset();
  return {
    monthly: { spent: monthlySpend, limit: MONTHLY_BUDGET, pct: (monthlySpend / MONTHLY_BUDGET * 100).toFixed(1) },
    session: SESSION_BUDGET,
  };
}

export function clearSession(sessionId) {
  sessionSpend.delete(sessionId);
}
