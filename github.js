// src/routes/github.js
// Secure GitHub API proxy — keeps GITHUB_TOKEN server-side
// GET  /api/github/repo/:owner/:repo/readme
// GET  /api/github/repo/:owner/:repo/tree
// POST /api/github/notify — trigger repository dispatch event
// GET  /api/github/repos  — list accessible repos

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/logger.js';
import logger from '../utils/logger.js';

const router = Router();

const GH_TOKEN = () => process.env.GITHUB_TOKEN;
const GH_OWNER = () => process.env.GITHUB_OWNER;

function ghHeaders() {
  const token = GH_TOKEN();
  if (!token || token.includes('REPLACE_ME')) {
    throw new Error('GITHUB_TOKEN not configured');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'AgentPool/1.0',
  };
}

// ── GET /api/github/repo/:owner/:repo/readme ──────────────────────────────────
router.get('/repo/:owner/:repo/readme', requireAuth, async (req, res) => {
  const { owner, repo } = req.params;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers: { ...ghHeaders(), 'Accept': 'application/vnd.github.v3.raw' } }
    );
    if (!r.ok) return res.status(r.status).json({ error: `GitHub ${r.status}` });
    const text = await r.text();
    audit('GITHUB_README', req.user.sub, { owner, repo });
    res.json({ readme: text.slice(0, 3000), truncated: text.length > 3000 });
  } catch (e) {
    logger.error('github_readme_error', { error: e.message, owner, repo });
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/github/repo/:owner/:repo/tree ────────────────────────────────────
router.get('/repo/:owner/:repo/tree', requireAuth, async (req, res) => {
  const { owner, repo } = req.params;
  const branch = req.query.branch || 'HEAD';
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: ghHeaders() }
    );
    if (!r.ok) return res.status(r.status).json({ error: `GitHub ${r.status}` });
    const data = await r.json();
    const files = data.tree
      ?.filter(f => f.type === 'blob')
      .map(f => f.path)
      .slice(0, 100) || [];
    res.json({ files, truncated: data.truncated || false, total: data.tree?.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/github/repos ────────────────────────────────────────────────────
router.get('/repos', requireAuth, async (req, res) => {
  try {
    const r = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=30&type=all`,
      { headers: ghHeaders() }
    );
    if (!r.ok) return res.status(r.status).json({ error: `GitHub ${r.status}` });
    const data = await r.json();
    const repos = data.map(r => ({
      name: r.name, fullName: r.full_name, private: r.private,
      description: r.description, updatedAt: r.updated_at,
      defaultBranch: r.default_branch, url: r.html_url,
    }));
    res.json(repos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/github/notify — trigger repository_dispatch ────────────────────
// Used by DevOps/Docs agents to trigger CI/CD after generating config
router.post('/notify', requireAuth, requireRole('developer'), async (req, res) => {
  const { repo, eventType, payload } = req.body;
  const owner = GH_OWNER();

  if (!repo || !eventType) {
    return res.status(400).json({ error: 'repo and eventType required' });
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/dispatches`,
      {
        method: 'POST',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, client_payload: payload || {} }),
      }
    );
    // GitHub returns 204 on success
    if (r.status === 204) {
      audit('GITHUB_DISPATCH', req.user.sub, { repo, eventType, owner });
      return res.json({ success: true, eventType, repo });
    }
    const err = await r.json().catch(() => ({}));
    res.status(r.status).json({ error: err.message || `GitHub ${r.status}` });
  } catch (e) {
    logger.error('github_dispatch_error', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/github/pr-comment — post review comment on a PR ────────────────
router.post('/pr-comment', requireAuth, requireRole('reviewer'), async (req, res) => {
  const { repo, prNumber, body } = req.body;
  const owner = GH_OWNER();

  if (!repo || !prNumber || !body) {
    return res.status(400).json({ error: 'repo, prNumber, body required' });
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message });
    }
    const comment = await r.json();
    audit('GITHUB_PR_COMMENT', req.user.sub, { repo, prNumber, commentId: comment.id });
    res.json({ success: true, commentId: comment.id, url: comment.html_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
