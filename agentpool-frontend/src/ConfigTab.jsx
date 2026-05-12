// src/ConfigTab.jsx
import { useState } from 'react';
import { fetchRepoReadme, fetchRepoTree } from './api.js';

const MODELS = {
  'claude-sonnet-4-20250514':          { label:'Claude Sonnet 4',  costIn:3.00,  costOut:15.00, free:false },
  'claude-haiku-4-5-20251001':         { label:'Claude Haiku 4',   costIn:0.80,  costOut:4.00,  free:false },
  'gpt-4o':                            { label:'GPT-4o',           costIn:2.50,  costOut:10.00, free:false },
  'gpt-4o-mini':                       { label:'GPT-4o Mini',      costIn:0.15,  costOut:0.60,  free:false },
  'gemini-1.5-flash':                  { label:'Gemini Flash',     costIn:0.075, costOut:0.30,  free:true  },
  'llama-3.3-70b-versatile':           { label:'Groq Llama 3.3',   costIn:0.00,  costOut:0.00,  free:true  },
  'llama-3.1-sonar-large-128k-online': { label:'Perplexity',       costIn:1.00,  costOut:1.00,  free:false },
};

function AgentConfigCard({ agent, cfg, setCfg, skills }) {
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');

  const activeSkills = skills.filter(s => (cfg.skills || []).includes(s.id) || s.global);

  const handleFetch = async () => {
    const url = cfg.repoUrl;
    if (!url) return;
    setFetching(true);
    try {
      const m = url.match(/github\.com\/([^/]+)\/([^/\s]+)/);
      if (m) {
        const [, owner, repo] = m;
        const clean = repo.replace(/\.git$/, '');
        const [rr, tr] = await Promise.all([
          fetchRepoReadme(owner, clean),
          fetchRepoTree(owner, clean),
        ]);
        setCfg({ ...cfg, repoContext: { readme: rr.readme, fileTree: tr.files?.join('\n') || '' } });
        setFetchMsg(`✓ ${tr.files?.length || 0} files`);
      }
    } catch (e) {
      setFetchMsg(`⚠ ${e.message}`);
    }
    setFetching(false);
  };

  const update = (field, value) => setCfg({ ...cfg, [field]: value });

  return (
    <div className={`acfg-card ${open ? 'open' : ''}`} style={{ '--ac': agent.color }}>
      <div className="acfg-row" onClick={() => setOpen(o => !o)}>
        <span style={{ color: agent.color, fontSize: 15 }}>{agent.icon}</span>
        <div style={{ flex: 1 }}>
          <div className="acfg-name">{agent.name}</div>
          <div className="acfg-lbl">{agent.label}</div>
        </div>
        <div className="acfg-tags">
          {cfg.repoUrl && <span className="cfg-tag">repo</span>}
          {cfg.customInstructions && <span className="cfg-tag">custom</span>}
          {activeSkills.length > 0 && (
            <span className="cfg-tag" style={{ borderColor: agent.color, color: agent.color }}>
              {activeSkills.length} skills
            </span>
          )}
        </div>
        <span className="acfg-chev">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="acfg-panel">
          {activeSkills.length > 0 && (
            <div className="acfg-field">
              <label className="sg-label">Active Skills</label>
              <div className="active-skills">
                {activeSkills.map(sk => (
                  <span key={sk.id} className="active-skill-chip" style={{ borderColor: sk.color, color: sk.color }}>
                    {sk.icon} {sk.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="acfg-field">
            <label className="sg-label">GitHub Repo URL</label>
            <div className="sg-input-row">
              <input
                className="sg-input"
                style={{ flex: 1 }}
                placeholder="https://github.com/owner/repo"
                value={cfg.repoUrl || ''}
                onChange={e => update('repoUrl', e.target.value)}
              />
              <button className="fetch-btn" onClick={handleFetch} disabled={fetching || !cfg.repoUrl}>
                {fetching ? '◌' : 'FETCH'}
              </button>
            </div>
            {fetchMsg && <div className="fetch-msg">{fetchMsg}</div>}
          </div>

          <div className="acfg-field">
            <label className="sg-label">Tech Stack</label>
            <input
              className="sg-input"
              placeholder="Go, PostgreSQL, Redis..."
              value={cfg.techStack || ''}
              onChange={e => update('techStack', e.target.value)}
            />
          </div>

          <div className="acfg-field">
            <label className="sg-label">Custom Instructions</label>
            <textarea
              className="sg-textarea"
              rows={3}
              placeholder="Additional instructions for this agent..."
              value={cfg.customInstructions || ''}
              onChange={e => update('customInstructions', e.target.value)}
            />
          </div>

          <div className="acfg-field sg-toggle-field">
            <div>
              <label className="sg-label">Override Mode</label>
              <div className="sg-hint">Replace base prompt entirely</div>
            </div>
            <div
              className={`toggle ${cfg.overrideMode ? 'on' : ''}`}
              style={cfg.overrideMode ? { '--tc': agent.color } : {}}
              onClick={() => update('overrideMode', !cfg.overrideMode)}
            >
              <div className="tknob" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfigTab({
  configs, setConfigs, skills, routing, setRouting,
  budgetSettings, setBudgetSettings, agents, user
}) {
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'developer' });
  const [userMsg, setUserMsg] = useState('');

  const setCfgForAgent = (agentId, newCfg) => {
    setConfigs(p => ({ ...p, [agentId]: newCfg }));
  };

  const handleCreateUser = async () => {
    try {
      const { createUser } = await import('./api.js');
      await createUser(userForm.username, userForm.password, userForm.role);
      setUserMsg(`✓ Created ${userForm.username}`);
      setUserForm({ username: '', password: '', role: 'developer' });
    } catch (e) {
      setUserMsg(`⚠ ${e.message}`);
    }
  };

  return (
    <div className="settings-page">

      {/* Budget */}
      <div className="settings-section">
        <div className="ss-title">Budget & Auto-Routing</div>
        <div className="settings-grid">
          <div className="sg-field">
            <label className="sg-label">Session Budget (USD)</label>
            <div className="sg-input-row">
              <span className="sg-prefix">$</span>
              <input
                className="sg-input"
                type="number" min="0" step="0.10"
                value={budgetSettings.sessionBudget}
                onChange={e => setBudgetSettings(p => ({ ...p, sessionBudget: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="sg-field">
            <label className="sg-label">Monthly Budget (USD)</label>
            <div className="sg-input-row">
              <span className="sg-prefix">$</span>
              <input
                className="sg-input"
                type="number" min="0" step="1"
                value={budgetSettings.monthlyBudget}
                onChange={e => setBudgetSettings(p => ({ ...p, monthlyBudget: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="sg-field sg-toggle-field">
            <label className="sg-label">Auto-Downgrade Models</label>
            <div
              className={`toggle ${budgetSettings.autoDowngrade ? 'on' : ''}`}
              onClick={() => setBudgetSettings(p => ({ ...p, autoDowngrade: !p.autoDowngrade }))}
            >
              <div className="tknob" />
            </div>
          </div>
          <div className="sg-field sg-toggle-field">
            <label className="sg-label">Prefer Free Tiers</label>
            <div
              className={`toggle ${budgetSettings.preferFree ? 'on' : ''}`}
              onClick={() => setBudgetSettings(p => ({ ...p, preferFree: !p.preferFree }))}
            >
              <div className="tknob" />
            </div>
          </div>
        </div>
      </div>

      {/* Model Routing */}
      <div className="settings-section">
        <div className="ss-title">Model Routing</div>
        <div className="routing-config">
          {agents.map(agent => {
            const cur = routing[agent.id] || 'claude-sonnet-4-20250514';
            const m = MODELS[cur];
            return (
              <div key={agent.id} className="rc-row">
                <span style={{ color: agent.color, fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{agent.icon}</span>
                <div className="rc-meta">
                  <div className="rc-name">{agent.name}</div>
                  <div className="rc-lbl">{agent.label}</div>
                </div>
                <select
                  className="rc-select"
                  value={cur}
                  style={{ borderColor: m?.free ? '#00ffcc' : 'var(--bd)' }}
                  onChange={e => setRouting(r => ({ ...r, [agent.id]: e.target.value }))}
                >
                  {Object.entries(MODELS).map(([key, mod]) => (
                    <option key={key} value={key}>
                      {mod.free ? '✦ ' : ''}{mod.label} — ${mod.costIn}/${mod.costOut}/1M
                    </option>
                  ))}
                </select>
                <span className="rc-cost">
                  {m?.free
                    ? <span style={{ color: '#00ffcc' }}>FREE</span>
                    : <span style={{ color: '#3a5060' }}>${m?.costIn}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <button
          className="reset-btn"
          onClick={() => setRouting({
            scrum: 'claude-sonnet-4-20250514', architect: 'claude-sonnet-4-20250514',
            codegen: 'gpt-4o', research: 'llama-3.1-sonar-large-128k-online',
            reviewer: 'claude-sonnet-4-20250514', tester: 'gpt-4o-mini',
            docs: 'gemini-1.5-flash', cybersec: 'claude-sonnet-4-20250514',
            crypto: 'claude-sonnet-4-20250514', commit: 'gpt-4o-mini',
            devops: 'gpt-4o', webdocs: 'claude-sonnet-4-20250514', dataeng: 'gpt-4o',
          })}
        >
          ↺ Reset Defaults
        </button>
      </div>

      {/* Per-Agent Config */}
      <div className="settings-section">
        <div className="ss-title">Per-Agent Configuration</div>
        <div className="agent-cfg-list">
          {agents.map(agent => (
            <AgentConfigCard
              key={agent.id}
              agent={agent}
              cfg={configs[agent.id] || {}}
              setCfg={newCfg => setCfgForAgent(agent.id, newCfg)}
              skills={skills}
            />
          ))}
        </div>
      </div>

      {/* Team (owner only) */}
      {user?.role === 'owner' && (
        <div className="settings-section">
          <div className="ss-title">Team Members</div>
          <div className="team-form">
            <input
              className="sg-input"
              placeholder="username"
              value={userForm.username}
              onChange={e => setUserForm(p => ({ ...p, username: e.target.value }))}
            />
            <input
              className="sg-input"
              type="password"
              placeholder="password (12+ chars)"
              value={userForm.password}
              onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
            />
            <select
              className="sg-input"
              value={userForm.role}
              onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}
            >
              {['owner', 'developer', 'reviewer', 'auditor'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button className="sf-save" onClick={handleCreateUser}>Add User</button>
          </div>
          {userMsg && <div className="fetch-msg" style={{ margin: '8px 0' }}>{userMsg}</div>}
        </div>
      )}
    </div>
  );
}
