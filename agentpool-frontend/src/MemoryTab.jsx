// src/MemoryTab.jsx
// Agent memory browser and manager
import { useState, useEffect } from 'react'
import { getToken } from './api.js'

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.safecitysentinel.com'
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
  : 'http://localhost:3001'

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }
}

const MEMORY_TYPES = {
  decision:     { label: 'Decision',     color: '#00d4ff' },
  code:         { label: 'Code',         color: '#00ff88' },
  error:        { label: 'Error/Bug',    color: '#ff4560' },
  schema:       { label: 'Schema',       color: '#ff9e80' },
  dependency:   { label: 'Dependency',   color: '#e040fb' },
  requirement:  { label: 'Requirement',  color: '#ffd700' },
  note:         { label: 'Note',         color: '#b0c8d8' },
}

function MemoryEntry({ entry, onDelete }) {
  const typeStyle = MEMORY_TYPES[entry.type] || MEMORY_TYPES.note
  return (
    <div className="mem-entry" style={{ '--mc': typeStyle.color }}>
      <div className="mem-entry-hdr">
        <span className="mem-entry-type" style={{ color: typeStyle.color, borderColor: typeStyle.color + '44' }}>{typeStyle.label}</span>
        <span className="mem-entry-ts">{new Date(entry.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        {entry.session && <span className="mem-entry-session">session {entry.session.slice(0, 6)}</span>}
        <button className="mem-del" onClick={function() { onDelete(entry.id) }}>✕</button>
      </div>
      <div className="mem-entry-content">{entry.content}</div>
      {entry.tags && entry.tags.length > 0 && (
        <div className="mem-tags">{entry.tags.map(function(t) { return <span key={t} className="mem-tag">{t}</span> })}</div>
      )}
    </div>
  )
}

export default function MemoryTab({ agents, project }) {
  const [memory,      setMemory]      = useState({})
  const [loading,     setLoading]     = useState(true)
  const [activeAgent, setActiveAgent] = useState(null)
  const [addForm,     setAddForm]     = useState({ show: false, type: 'decision', content: '', tags: '' })
  const [saving,      setSaving]      = useState(false)

  const proj = project || 'sentinel-vault'

  useEffect(function() {
    loadMemory()
  }, [proj])

  async function loadMemory() {
    setLoading(true)
    try {
      const res = await fetch(API_BASE + '/api/memory/' + proj, { headers: authHeaders() })
      const data = await res.json()
      setMemory(data.memory || {})
    } catch(e) { console.log('memory load error', e) }
    setLoading(false)
  }

  async function addEntry() {
    if (!addForm.content.trim() || !activeAgent) return
    setSaving(true)
    try {
      const tags = addForm.tags.split(',').map(function(t) { return t.trim() }).filter(Boolean)
      await fetch(API_BASE + '/api/memory/' + proj + '/' + activeAgent, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ entries: [{ type: addForm.type, content: addForm.content, tags }] })
      })
      setAddForm(function(p) { return Object.assign({}, p, { show: false, content: '', tags: '' }) })
      await loadMemory()
    } catch(e) { console.log('add error', e) }
    setSaving(false)
  }

  async function clearAgentMemory(agentId) {
    if (!confirm('Clear all memory for ' + agentId + '?')) return
    try {
      await fetch(API_BASE + '/api/memory/' + proj + '/' + agentId, { method: 'DELETE', headers: authHeaders() })
      await loadMemory()
    } catch(e) { console.log('clear error', e) }
  }

  const activeEntries = activeAgent && memory[activeAgent] ? memory[activeAgent].entries || [] : []
  const totalEntries  = Object.values(memory).reduce(function(sum, m) { return sum + ((m.entries && m.entries.length) || 0) }, 0)

  return (
    <div className="memory-page">
      <div className="memory-layout">
        {/* Left — agent list */}
        <div className="memory-sidebar">
          <div className="memory-sidebar-hdr">
            <div className="sk-title">Agent Memory</div>
            <div className="sk-sub">{totalEntries} entries · {proj}</div>
          </div>
          {loading && <div className="sess-loading">◌ Loading...</div>}
          {agents.filter(function(a) { return !a.isOrchestrator }).map(function(agent) {
            const agentMem = memory[agent.id]
            const count    = agentMem ? (agentMem.entries || []).length : 0
            return (
              <div key={agent.id}
                className={'mem-agent-row' + (activeAgent === agent.id ? ' active' : '')}
                style={{ '--ac': agent.color }}
                onClick={function() { setActiveAgent(agent.id) }}>
                <span style={{ color: agent.color, fontSize: 14 }}>{agent.icon}</span>
                <div className="mem-agent-meta">
                  <div className="mem-agent-name">{agent.name}</div>
                  <div className="mem-agent-count">{count} {count === 1 ? 'entry' : 'entries'}</div>
                </div>
                {count > 0 && <div className="mem-dot" style={{ background: agent.color }} />}
              </div>
            )
          })}
        </div>

        {/* Right — memory entries */}
        <div className="memory-detail">
          {!activeAgent && (
            <div className="sess-empty" style={{ height: '100%' }}>
              <div style={{ fontSize: 32, opacity: .1, color: '#00d4ff' }}>◈</div>
              <div style={{ opacity: .3 }}>Select an agent to view memory</div>
            </div>
          )}
          {activeAgent && (
            <>
              <div className="memory-detail-hdr">
                {(function() {
                  const agent = agents.find(function(a) { return a.id === activeAgent })
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: agent && agent.color, fontSize: 16 }}>{agent && agent.icon}</span>
                        <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, color: 'var(--tb)' }}>{agent && agent.name}</span>
                        <span style={{ fontSize: 9, color: 'var(--td)' }}>{activeEntries.length} entries</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="sk-act" onClick={function() { setAddForm(function(p) { return Object.assign({}, p, { show: !p.show }) }) }}>+ Add</button>
                        {activeEntries.length > 0 && <button className="sk-act sk-del" onClick={function() { clearAgentMemory(activeAgent) }}>Clear All</button>}
                      </div>
                    </>
                  )
                })()}
              </div>

              {addForm.show && (
                <div className="mem-add-form">
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <select className="sg-input" style={{ flex: 1 }} value={addForm.type}
                      onChange={function(e) { setAddForm(function(p) { return Object.assign({}, p, { type: e.target.value }) }) }}>
                      {Object.entries(MEMORY_TYPES).map(function(entry) {
                        return <option key={entry[0]} value={entry[0]}>{entry[1].label}</option>
                      })}
                    </select>
                    <input className="sg-input" style={{ flex: 2 }} placeholder="tags: ratchet, schema, go"
                      value={addForm.tags}
                      onChange={function(e) { setAddForm(function(p) { return Object.assign({}, p, { tags: e.target.value }) }) }} />
                  </div>
                  <textarea className="sg-textarea" rows={3} placeholder="Memory content..."
                    value={addForm.content}
                    onChange={function(e) { setAddForm(function(p) { return Object.assign({}, p, { content: e.target.value }) }) }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="sf-save" onClick={addEntry} disabled={saving || !addForm.content.trim()}>
                      {saving ? '◌' : 'Save'}
                    </button>
                    <button className="sf-cancel" onClick={function() { setAddForm(function(p) { return Object.assign({}, p, { show: false }) }) }}>Cancel</button>
                  </div>
                </div>
              )}

              {activeEntries.length === 0 && !addForm.show && (
                <div className="sess-empty">
                  <div style={{ opacity: .3 }}>No memory yet for this agent</div>
                  <div style={{ fontSize: 9, opacity: .2 }}>Memory is auto-extracted after each session</div>
                </div>
              )}

              <div className="mem-entries">
                {activeEntries.slice().reverse().map(function(entry) {
                  return (
                    <MemoryEntry key={entry.id} entry={entry}
                      onDelete={async function(id) {
                        // Remove locally for now — full delete API can be added
                        setMemory(function(p) {
                          const agMem = p[activeAgent]
                          if (!agMem) return p
                          const next = Object.assign({}, agMem, {
                            entries: agMem.entries.filter(function(e) { return e.id !== id })
                          })
                          return Object.assign({}, p, { [activeAgent]: next })
                        })
                      }}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
