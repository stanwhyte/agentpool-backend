// src/routes/notify.js
// POST /api/notify — fire Slack + email notifications
// Called by frontend when agent events occur

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../utils/logger.js';
import logger from '../utils/logger.js';

const router = Router();

// ── Slack ─────────────────────────────────────────────────────────────────────
async function sendSlack(event, payload) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || url.includes('REPLACE_ME')) {
    logger.debug('Slack not configured — skipping');
    return { skipped: true };
  }

  const colors = {
    session_complete: '#00ff88',
    budget_warning:   '#ff9500',
    budget_critical:  '#ff4560',
    agent_error:      '#ff4560',
    pr_ready:         '#40c4ff',
    docs_updated:     '#69ff47',
    deploy_ready:     '#00e5ff',
    monthly_report:   '#00ffcc',
  };

  const body = {
    attachments: [{
      color: colors[event] || '#888888',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*AgentPool — ${event.replace(/_/g, ' ').toUpperCase()}*\n${payload.message || ''}`,
          },
        },
        payload.cost || payload.session ? {
          type: 'context',
          elements: [
            payload.session ? { type: 'mrkdwn', text: `Session #${payload.session}` } : null,
            payload.cost    ? { type: 'mrkdwn', text: `Cost: $${parseFloat(payload.cost).toFixed(5)}` } : null,
          ].filter(Boolean),
        } : null,
      ].filter(Boolean),
    }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

// ── Email via Resend ──────────────────────────────────────────────────────────
async function sendEmail(event, payload) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ALERT_EMAIL_TO;
  const from   = process.env.ALERT_EMAIL_FROM || 'agentpool@yourdomain.com';

  if (!apiKey || apiKey.includes('REPLACE_ME') || !to) {
    logger.debug('Email not configured — skipping');
    return { skipped: true };
  }

  const subject = `AgentPool: ${event.replace(/_/g, ' ')}`;
  const html = `
    <div style="font-family:monospace;background:#07090c;color:#b0c8d8;padding:20px;border-radius:4px">
      <h2 style="color:#00d4ff;font-size:16px;margin-bottom:12px">AgentPool — ${event.toUpperCase()}</h2>
      <p style="margin-bottom:8px">${payload.message || ''}</p>
      ${payload.session ? `<p style="color:#3a5060;font-size:12px">Session #${payload.session}</p>` : ''}
      ${payload.cost    ? `<p style="color:#ff9500;font-size:12px">Cost: $${parseFloat(payload.cost).toFixed(5)}</p>` : ''}
      <hr style="border-color:#1a2530;margin:12px 0"/>
      <p style="color:#3a5060;font-size:11px">${new Date().toISOString()}</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, id: data.id };
}

// ── POST /api/notify ──────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { event, payload } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });

  const results = await Promise.allSettled([
    sendSlack(event, payload || {}),
    sendEmail(event, payload || {}),
  ]);

  const [slack, email] = results.map(r =>
    r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
  );

  audit('NOTIFICATION_SENT', req.user.sub, { event, slack, email });

  res.json({
    event,
    channels: { slack, email },
    ts: new Date().toISOString(),
  });
});

export default router;
