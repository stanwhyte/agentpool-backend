// src/ConfigTab.jsx
import { useState } from 'react'
import { fetchRepoReadme, fetchRepoTree, createUser } from './api.js'
import LocalLLMConfig from './LocalLLMConfig.jsx'

const MODELS = {
  'claude-sonnet-4-20250514':  { label: 'Claude Sonnet 4',   costIn: 3.00,  costOut: 15.00, free: false, local: false },
  'claude-haiku-4-5-20251001': { label: 'Claude Haiku 4',    costIn: 0.80,  costOut: 4.00,  free: false, local: false },
  'gpt-4o':                    { label: 'GPT-4o',            costIn: 2.50,  costOut: 10.00, free: false, local: false },
  'gpt-4o-mini':               { label: 'GPT-4o Mini',       costIn: 0.15,  costOut: 0.60,  free: false, local: false },
  'gemini-2.0-flash':          { label: 'Gemini Flash',      costIn: 0.075, costOut: 0.30,  free: true,  local: false },
  'llama-3.3-70b-versatile':   { label: 'Groq Llama 3.3',    costIn: 0.00,  costOut: 0.00,  free: true,  local: false },
  'sonar-pro':                 { label: 'Perplexity Sonar',   costIn: 3.00,  costOut: 15.00, free: false, local: false },
  'ollama/llama3.2':           { label: '⚡ Llama 3.2',       costIn: 0.00,  costOut: 0.00,  free: true,  local: true  },
  'ollama/llama3.1':           { label: '⚡ Llama 3.1',       costIn: 0.00,  costOut: 0.00,  free: true,  local: true  },
  'ollama/codellama':          { label: '⚡ CodeLlama',       costIn: 0.00,  costOut: 0.00,  free: true,  local: true  },
  'ollama/deepseek-coder':     { label: '⚡ DeepSeek Coder',  costIn: 0.00,  costOut: 0.00,  free: true,  local: true  },
  'ollama/qwen2.5-coder':      { label: '⚡ Qwen2.5 Coder',   costIn: 0.00,  costOut: 0.00,  free: true,  local: true  },
  'ollama/mistral':            { label: '⚡ Mistral',         costIn: 0.00,  costOut: 0.00,  free: true,  local: true  },
}

const DEFAULT_ROUTING = {
  scrum: 'claude-sonnet-4-20250514', architect: 'claude-sonnet-4-20250514',
  codegen: 'gpt-4o', research: 'sonar-pro',
  reviewer: 'claude-sonnet-4-20250514', tester: 'gpt-4o-mini',
  docs: 'llama-3.3-70b-versatile', cybersec: 'claude-sonnet-4-20250514',
  crypto: 'claude-sonnet-4-20250514', commit: 'gpt-4o-mini',
  devops: 'gpt-4o', webdocs: 'claude-sonnet-4-20250514', dataeng: 'gpt-4o',
  performance: 'gpt-4o',
}

function AgentCfgCard({ agent, cfg, onChange, skills }) {
  const [open,     setOpen]     = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')

  const activeSkills = skills.filter(function(s) {
    return ((cfg.skills || []).includes(s.id)) || s.global
  })

  function set(field, value) {
    onChange(Object.assign({}, cfg, { [field]: value }))
  }

  async function handleFetch() {
    const url = cfg.repoUrl
    if (!url) return
    setFetching(true)
    try {
      const m = url.match(/github\.com\/([^/]+)\/([^/\s]+)/)
      if (m) {
        const owner = m[1]
        const repo  = m[2].replace(/\.git$/, '')
        const rr    = await fetchRepoReadme(owner, repo)
        const tr    = await fetchRepoTree(owner, repo)
        set('repoContext', { readme: rr.readme, fileTree: (tr.files || []).join('\n') })
        setFetchMsg('✓ ' + (tr.files || []).length + ' files')
      }
    } catch(e) {
      setFetchMsg('⚠ ' + e.message)
    }
    setFetching(false)
  }

  return (
    <div className={'acfg-card' + (open ? ' open' : '')} style={{ '--ac': agent.color }}>
      <div className="acfg-row" onClick={function() { setOpen(function(o) { return !o }) }}>
        <span style={{ color: agent.color, fontSize: 15 }}>{agent.icon}</span>
        <div style={{ flex: 1 }}>
          <div className="acfg-name">{agent.name}</div>
          <div className="acfg-lbl">{agent.label}</div>
        </div>
        <div className="acfg-tags">
          {cfg.repoUrl && <span className="cfg-tag">repo</span>}
          {cfg.customInstructions && <span className="cfg-tag">custom</span>}
          {activeSkills.length > 0 && <span className="cfg-tag" style={{ borderColor: agent.color, color: agent.color }}>{activeSkills.length} skills</span>}
        </div>
        <span className="acfg-chev">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="acfg-panel">
          {activeSkills.length > 0 && (
            <div className="acfg-field">
              <label className="sg-label">Active Skills</label>
              <div className="active-skills">
                {activeSkills.map(function(sk) {
                  return <span key={sk.id} className="active-skill-chip" style={{ borderColor: sk.color, color: sk.color }}>{sk.icon} {sk.name}</span>
                })}
              </div>
            </div>
          )}
          <div className="acfg-field">
            <label className="sg-label">GitHub Repo URL</label>
            <div className="sg-input-row">
              <input className="sg-input" style={{ flex: 1 }} placeholder="https://github.com/owner/repo"
                value={cfg.repoUrl || ''} onChange={function(e) { set('repoUrl', e.target.value) }} />
              <button className="fetch-btn" onClick={handleFetch} disabled={fetching || !cfg.repoUrl}>
                {fetching ? '◌' : 'FETCH'}
              </button>
            </div>
            {fetchMsg && <div className="fetch-msg">{fetchMsg}</div>}
          </div>
          <div className="acfg-field">
            <label className="sg-label">Tech Stack</label>
            <input className="sg-input" placeholder="Go, PostgreSQL, Redis..."
              value={cfg.techStack || ''} onChange={function(e) { set('techStack', e.target.value) }} />
          </div>
          <div className="acfg-field">
            <label className="sg-label">Custom Instructions</label>
            <textarea className="sg-textarea" rows={3} placeholder="Additional instructions..."
              value={cfg.customInstructions || ''} onChange={function(e) { set('customInstructions', e.target.value) }} />
          </div>
          <div className="acfg-field sg-toggle-field">
            <div>
              <label className="sg-label">Override Mode</label>
              <div className="sg-hint">Replace base prompt entirely</div>
            </div>
            <div className={'toggle' + (cfg.overrideMode ? ' on' : '')}
              style={cfg.overrideMode ? { '--tc': agent.color } : {}}
              onClick={function() { set('overrideMode', !cfg.overrideMode) }}>
              <div className="tknob" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ConfigTab({ configs, setConfigs, skills, routing, setRouting, budgetSettings, setBudgetSettings, agents, user, localLLM, setLocalLLM, timezone, setTimezone }) {
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'developer' })
  const [userMsg,  setUserMsg]  = useState('')

  function setBudget(field, value) {
    setBudgetSettings(function(p) { return Object.assign({}, p, { [field]: value }) })
  }

  function setAgentCfg(agentId, newCfg) {
    setConfigs(function(p) { return Object.assign({}, p, { [agentId]: newCfg }) })
  }

  async function handleAddUser() {
    try {
      await createUser(userForm.username, userForm.password, userForm.role)
      setUserMsg('✓ Created ' + userForm.username)
      setUserForm({ username: '', password: '', role: 'developer' })
    } catch(e) {
      setUserMsg('⚠ ' + e.message)
    }
  }

  return (
    <div className="settings-page">

      <LocalLLMConfig localLLM={localLLM} setLocalLLM={setLocalLLM} />

      <div className="settings-section">
        <div className="ss-title">Timezone</div>
        <div style={{ fontSize: 10, color: 'var(--td)', marginBottom: 10 }}>
          Used for all agent timestamps, PostgreSQL session config, cron expressions and logs.
          Currently: <span style={{ color: '#00d4ff' }}>{timezone}</span>
        </div>
        <div className="settings-grid">
          <div className="sg-field">
            <label className="sg-label">Your Timezone</label>
            <select className="sg-input" value={timezone} onChange={function(e) { setTimezone(e.target.value) }}>
              {[
                'UTC',
                'Europe/Warsaw','Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid',
                'Europe/Moscow','Europe/Kiev','Europe/Istanbul',
                'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
                'America/Toronto','America/Vancouver','America/Sao_Paulo',
                'Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Asia/Shanghai',
                'Australia/Sydney','Pacific/Auckland',
                'Africa/Johannesburg','Africa/Lagos',
              ].map(function(tz) { return <option key={tz} value={tz}>{tz.replace('_',' ')}</option> })}
            </select>
          </div>
          <div className="sg-field">
            <label className="sg-label">Current Time in Selected Zone</label>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--bd)', padding: '6px 8px', fontSize: 11, color: '#00ffcc', fontFamily: 'var(--mono)' }}>
              {new Date().toLocaleString('en-GB', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium' })}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 9, color: 'var(--td)' }}>
          Agents will use this in: PostgreSQL SET timezone, Go time.LoadLocation(), cron schedules, audit log timestamps, key rotation schedules
        </div>
      </div>

      <div className="settings-section">
        <div className="ss-title">Budget &amp; Auto-Routing</div>
        <div className="settings-grid">
          <div className="sg-field">
            <label className="sg-label">Session Budget (USD)</label>
            <div className="sg-input-row">
              <span className="sg-prefix">$</span>
              <input className="sg-input" type="number" min="0" step="0.10"
                value={budgetSettings.sessionBudget}
                onChange={function(e) { setBudget('sessionBudget', parseFloat(e.target.value) || 0) }} />
            </div>
          </div>
          <div className="sg-field">
            <label className="sg-label">Monthly Budget (USD)</label>
            <div className="sg-input-row">
              <span className="sg-prefix">$</span>
              <input className="sg-input" type="number" min="0" step="1"
                value={budgetSettings.monthlyBudget}
                onChange={function(e) { setBudget('monthlyBudget', parseFloat(e.target.value) || 0) }} />
            </div>
          </div>
          <div className="sg-field sg-toggle-field">
            <label className="sg-label">Auto-Downgrade Models</label>
            <div className={'toggle' + (budgetSettings.autoDowngrade ? ' on' : '')}
              onClick={function() { setBudget('autoDowngrade', !budgetSettings.autoDowngrade) }}>
              <div className="tknob" />
            </div>
          </div>
          <div className="sg-field sg-toggle-field">
            <label className="sg-label">Prefer Free Tiers</label>
            <div className={'toggle' + (budgetSettings.preferFree ? ' on' : '')}
              onClick={function() { setBudget('preferFree', !budgetSettings.preferFree) }}>
              <div className="tknob" />
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="ss-title">Model Routing</div>
        <div className="routing-config">
          {agents.map(function(agent) {
            const cur = routing[agent.id] || 'claude-sonnet-4-20250514'
            const m   = MODELS[cur]
            return (
              <div key={agent.id} className="rc-row">
                <span style={{ color: agent.color, fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{agent.icon}</span>
                <div className="rc-meta">
                  <div className="rc-name">{agent.name}</div>
                  <div className="rc-lbl">{agent.label}</div>
                </div>
                <select className="rc-select" value={cur}
                  style={{ borderColor: m && m.local ? '#00ffcc' : m && m.free ? '#00ffcc' : 'var(--bd)' }}
                  onChange={function(e) {
                    const v = e.target.value
                    setRouting(function(r) { return Object.assign({}, r, { [agent.id]: v }) })
                  }}>
                  <optgroup label="☁ Cloud Models">
                    {Object.entries(MODELS).filter(function(e) { return !e[1].local }).map(function(entry) {
                      return (
                        <option key={entry[0]} value={entry[0]}>
                          {entry[1].free ? '✦ ' : ''}{entry[1].label} {entry[1].costIn > 0 ? '— $' + entry[1].costIn + '/' + entry[1].costOut + '/1M' : '— FREE'}
                        </option>
                      )
                    })}
                  </optgroup>
                  <optgroup label="⚡ Local Models (Ollama)">
                    {Object.entries(MODELS).filter(function(e) { return e[1].local }).map(function(entry) {
                      return <option key={entry[0]} value={entry[0]}>{entry[1].label} — FREE</option>
                    })}
                  </optgroup>
                </select>
                <span className="rc-cost">
                  {m && (m.local || m.free)
                    ? <span style={{ color: '#00ffcc' }}>{m.local ? '⚡' : '✦'} FREE</span>
                    : <span style={{ color: '#3a5060' }}>{m ? '$' + m.costIn : ''}</span>}
                </span>
              </div>
            )
          })}
        </div>
        <button className="reset-btn" onClick={function() { setRouting(DEFAULT_ROUTING) }}>↺ Reset Defaults</button>
      </div>

      <div className="settings-section">
        <div className="ss-title">Per-Agent Configuration</div>
        <div className="agent-cfg-list">
          {agents.map(function(agent) {
            return (
              <AgentCfgCard key={agent.id} agent={agent}
                cfg={configs[agent.id] || {}}
                onChange={function(newCfg) { setAgentCfg(agent.id, newCfg) }}
                skills={skills}
              />
            )
          })}
        </div>
      </div>

      {user && user.role === 'owner' && (
        <div className="settings-section">
          <div className="ss-title">Team Members</div>
          <div className="team-form">
            <input className="sg-input" placeholder="username"
              value={userForm.username}
              onChange={function(e) { setUserForm(function(p) { return Object.assign({}, p, { username: e.target.value }) }) }} />
            <input className="sg-input" type="password" placeholder="password"
              value={userForm.password}
              onChange={function(e) { setUserForm(function(p) { return Object.assign({}, p, { password: e.target.value }) }) }} />
            <select className="sg-input" value={userForm.role}
              onChange={function(e) { setUserForm(function(p) { return Object.assign({}, p, { role: e.target.value }) }) }}>
              {['owner','developer','reviewer','auditor'].map(function(r) { return <option key={r} value={r}>{r}</option> })}
            </select>
            <button className="sf-save" onClick={handleAddUser}>Add User</button>
          </div>
          {userMsg && <div className="fetch-msg" style={{ margin: '8px 0' }}>{userMsg}</div>}
        </div>
      )}

    </div>
  )
}
