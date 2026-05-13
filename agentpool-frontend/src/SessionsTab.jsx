// src/SessionsTab.jsx
import { useState, useEffect } from 'react'
import { getToken } from './api.js'

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
  : 'http://localhost:3001'

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }
}

function md(text) {
  if (!text) return ''
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, function(_, l, c) { return '<pre class="cb"><code>' + c.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>' })
    .replace(/`([^`]+)`/g, '<code class="ic">$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>').replace(/^\d+\. (.+)$/gm, '<li class="n">$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hplic])(.+)$/gm, function(m) { return m.startsWith('<') ? m : '<p>' + m + '</p>' })
}

function AgentOutput({ agentId, output, agents }) {
  const [expanded, setExpanded] = useState(false)
  const agent = agents.find(function(a) { return a.id === agentId })
  if (!output) return null
  return (
    <div className="so-agent" style={{ '--ac': (agent && agent.color) || '#00d4ff' }}>
      <div className="so-agent-hdr" onClick={function() { setExpanded(function(e) { return !e }) }}>
        <span style={{ color: (agent && agent.color) || '#00d4ff' }}>{(agent && agent.icon) || '◈'}</span>
        <span className="so-agent-name">{(agent && agent.name) || agentId}</span>
        <span className="so-agent-words">{output.split(' ').length}w</span>
        <span className="so-chev">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && <div className="so-agent-body out" dangerouslySetInnerHTML={{ __html: md(output) }} />}
    </div>
  )
}

export default function SessionsTab({ agents }) {
  const [sessions,  setSessions]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [detail,    setDetail]    = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(function() {
    async function load() {
      try {
        const res = await fetch(API_BASE + '/api/sessions', { headers: authHeaders() })
        const data = await res.json()
        setSessions(data.sessions || [])
      } catch(e) { console.log('sessions load error', e) }
      setLoading(false)
    }
    load()
  }, [])

  async function loadDetail(id) {
    setSelected(id)
    setDetail(null)
    setLoadingDetail(true)
    try {
      const res = await fetch(API_BASE + '/api/sessions/' + id, { headers: authHeaders() })
      const data = await res.json()
      setDetail(data.session)
    } catch(e) { console.log('session detail error', e) }
    setLoadingDetail(false)
  }

  async function deleteSession(id) {
    try {
      await fetch(API_BASE + '/api/sessions/' + id, { method: 'DELETE', headers: authHeaders() })
      setSessions(function(p) { return p.filter(function(s) { return s.id !== id }) })
      if (selected === id) { setSelected(null); setDetail(null) }
    } catch(e) { console.log('delete error', e) }
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="sessions-page">
      <div className="sessions-layout">
        {/* Left — session list */}
        <div className="sessions-list">
          <div className="sessions-list-hdr">
            <div className="sk-title">Session History</div>
            <div className="sk-sub">{sessions.length} sessions saved</div>
          </div>
          {loading && <div className="sess-loading">◌ Loading...</div>}
          {!loading && sessions.length === 0 && (
            <div className="sess-empty">
              <div style={{ fontSize: 24, opacity: .15, color: '#00d4ff' }}>◈</div>
              <div>No sessions yet</div>
              <div style={{ fontSize: 9, opacity: .5 }}>Run your first session to see it here</div>
            </div>
          )}
          {sessions.map(function(s) {
            return (
              <div key={s.id} className={'sess-item' + (selected === s.id ? ' active' : '')} onClick={function() { loadDetail(s.id) }}>
                <div className="sess-item-req">{s.requirement.slice(0, 80)}{s.requirement.length > 80 ? '...' : ''}</div>
                <div className="sess-item-meta">
                  <span style={{ color: '#00d4ff' }}>{s.agentCount} agents</span>
                  <span style={{ color: '#ff9500' }}>${(s.cost || 0).toFixed(4)}</span>
                  <span style={{ color: '#3a5060' }}>{formatDate(s.ts)}</span>
                  <button className="sess-del" onClick={function(e) { e.stopPropagation(); deleteSession(s.id) }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right — session detail */}
        <div className="sessions-detail">
          {!selected && (
            <div className="sess-empty" style={{ height: '100%' }}>
              <div style={{ fontSize: 36, opacity: .08, color: '#00d4ff' }}>⬡</div>
              <div style={{ opacity: .3 }}>Select a session to view outputs</div>
            </div>
          )}
          {selected && loadingDetail && (
            <div className="sess-empty" style={{ height: '100%' }}>
              <div style={{ color: '#00d4ff' }}>◌ Loading session...</div>
            </div>
          )}
          {selected && detail && !loadingDetail && (
            <div className="sess-detail-content">
              <div className="sess-detail-hdr">
                <div>
                  <div className="sess-detail-req">{detail.requirement}</div>
                  <div className="sess-detail-meta">
                    <span style={{ color: '#00d4ff' }}>{Object.keys(detail.outputs || {}).length} agents</span>
                    <span style={{ color: '#ff9500' }}>${(detail.cost || 0).toFixed(5)}</span>
                    <span style={{ color: '#3a5060' }}>{formatDate(detail.ts)}</span>
                  </div>
                </div>
              </div>

              {detail.scrumPlan && (
                <div className="sess-section">
                  <div className="sess-section-title"><span style={{ color: '#fff' }}>⬡</span> Sprint Plan</div>
                  <div className="out" style={{ fontSize: 11 }} dangerouslySetInnerHTML={{ __html: md(detail.scrumPlan) }} />
                </div>
              )}

              <div className="sess-section">
                <div className="sess-section-title">Agent Outputs</div>
                <div className="sess-agents">
                  {Object.entries(detail.outputs || {}).map(function(entry) {
                    return <AgentOutput key={entry[0]} agentId={entry[0]} output={entry[1]} agents={agents} />
                  })}
                </div>
              </div>

              {detail.scrumSynth && (
                <div className="sess-section">
                  <div className="sess-section-title"><span style={{ color: '#00ff88' }}>⬡</span> Execution Plan</div>
                  <div className="out" style={{ fontSize: 11 }} dangerouslySetInnerHTML={{ __html: md(detail.scrumSynth) }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
