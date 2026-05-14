import { useState } from 'react'

function uid() { return Math.random().toString(36).slice(2, 9) }

const CATS = ['domain', 'tech', 'security', 'compliance', 'process', 'custom']

function SkillForm({ initial, onSave, onCancel }) {
  const blank = { name: '', icon: '◆', color: '#00d4ff', category: 'custom', description: '', content: '', global: false }
  const [form, setForm] = useState(initial ? Object.assign({}, initial) : blank)

  function set(field, value) {
    setForm(function(f) { return Object.assign({}, f, { [field]: value }) })
  }

  function handleSave() {
    if (!form.name.trim() || !form.content.trim()) return
    onSave(form)
  }

  return (
    <div className="skill-form">
      <div className="sf-title">{initial ? 'Edit Skill' : 'New Skill'}</div>
      <div className="sf-grid">
        <div className="sf-field">
          <label className="sg-label">Name</label>
          <input className="sg-input sf-input" value={form.name} placeholder="Skill name"
            onChange={function(e) { set('name', e.target.value) }} />
        </div>
        <div className="sf-field">
          <label className="sg-label">Icon</label>
          <input className="sg-input sf-input" value={form.icon} placeholder="◆"
            onChange={function(e) { set('icon', e.target.value) }} />
        </div>
        <div className="sf-field">
          <label className="sg-label">Color</label>
          <input className="sg-input sf-input" value={form.color} placeholder="#00d4ff"
            onChange={function(e) { set('color', e.target.value) }} />
        </div>
        <div className="sf-field">
          <label className="sg-label">Category</label>
          <select className="sg-input sf-input" value={form.category}
            onChange={function(e) { set('category', e.target.value) }}>
            {CATS.map(function(c) { return <option key={c} value={c}>{c}</option> })}
          </select>
        </div>
      </div>
      <div className="sf-field" style={{ marginBottom: 8 }}>
        <label className="sg-label">Description</label>
        <input className="sg-input sf-input" value={form.description} placeholder="Short description"
          onChange={function(e) { set('description', e.target.value) }} />
      </div>
      <div className="sf-field">
        <label className="sg-label">Content (injected into agent prompt)</label>
        <textarea className="sf-textarea" rows={8} value={form.content}
          placeholder="Write the skill content..."
          onChange={function(e) { set('content', e.target.value) }} />
      </div>
      <div className="sf-field sg-toggle-field" style={{ marginTop: 10 }}>
        <div><label className="sg-label">Global — inject into ALL agents</label></div>
        <div className={'toggle' + (form.global ? ' on' : '')}
          style={form.global ? { '--tc': '#00ffcc' } : {}}
          onClick={function() { set('global', !form.global) }}>
          <div className="tknob" />
        </div>
      </div>
      <div className="sf-actions">
        <button className="sf-save" onClick={handleSave}>Save</button>
        <button className="sf-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function SkillCard({ skill, agents, agentConfigs, onEdit, onDelete, onToggleGlobal, onToggleAgent }) {
  const [assignOpen, setAssignOpen] = useState(false)
  const assignedCount = agents.filter(function(a) {
    return (agentConfigs[a.id] && agentConfigs[a.id].skills || []).includes(skill.id)
  }).length

  return (
    <div className={'skill-card' + (skill.global ? ' global' : '')} style={{ '--skc': skill.color }}>
      <div className="sk-card-hdr">
        <span className="sk-card-icon" style={{ color: skill.color }}>{skill.icon}</span>
        <div>
          <div className="sk-card-name">{skill.name}</div>
          <div className="sk-card-desc">{skill.description}</div>
        </div>
        {skill.global && <span className="sk-global">GLOBAL</span>}
      </div>
      <div className="sk-card-preview">{skill.content.slice(0, 100)}...</div>
      <div className="sk-card-actions">
        <button className="sk-act" onClick={function() { onEdit(skill) }}>✎</button>
        <button className={'sk-act' + (skill.global ? ' sk-act-on' : '')}
          onClick={function() { onToggleGlobal(skill.id) }}>
          {skill.global ? '◉ Global' : '○ Global'}
        </button>
        <button className="sk-act sk-assign"
          onClick={function() { setAssignOpen(function(o) { return !o }) }}>
          ⊕ Assign ({assignedCount})
        </button>
        {!skill.builtin && (
          <button className="sk-act sk-del" onClick={function() { onDelete(skill.id) }}>✕</button>
        )}
      </div>
      {assignOpen && (
        <div className="sk-assign-panel">
          <div className="sk-assign-title">Assign to agents:</div>
          <div className="sk-assign-agents">
            {agents.map(function(agent) {
              const has = (agentConfigs[agent.id] && agentConfigs[agent.id].skills || []).includes(skill.id)
              return (
                <button key={agent.id}
                  className={'sk-agent-btn' + (has ? ' active' : '')}
                  style={has ? { borderColor: agent.color, color: agent.color, background: agent.color + '15' } : {}}
                  onClick={function() { onToggleAgent(agent.id, skill.id) }}>
                  <span style={{ color: agent.color }}>{agent.icon}</span> {agent.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SkillsTab({ skills, setSkills, agentConfigs, setAgentConfigs, agents }) {
  const [editing, setEditing] = useState(null)

  function handleSave(form) {
    if (editing === 'new') {
      setSkills(function(p) { return [...p, Object.assign({}, form, { id: 'custom-' + uid(), builtin: false })] })
    } else {
      setSkills(function(p) { return p.map(function(s) { return s.id === editing.id ? Object.assign({}, s, form) : s }) })
    }
    setEditing(null)
  }

  function handleDelete(id) {
    setSkills(function(p) { return p.filter(function(s) { return s.id !== id }) })
    setAgentConfigs(function(p) {
      const next = Object.assign({}, p)
      Object.keys(next).forEach(function(aid) {
        if (next[aid] && next[aid].skills) {
          next[aid] = Object.assign({}, next[aid], { skills: next[aid].skills.filter(function(sid) { return sid !== id }) })
        }
      })
      return next
    })
  }

  function handleToggleGlobal(id) {
    setSkills(function(p) { return p.map(function(s) { return s.id === id ? Object.assign({}, s, { global: !s.global }) : s }) })
  }

  function handleToggleAgent(agentId, skillId) {
    setAgentConfigs(function(p) {
      const cur = (p[agentId] && p[agentId].skills) || []
      const has = cur.includes(skillId)
      const next = Object.assign({}, p[agentId], { skills: has ? cur.filter(function(s) { return s !== skillId }) : [...cur, skillId] })
      return Object.assign({}, p, { [agentId]: next })
    })
  }

  return (
    <div className="skills-page">
      <div className="skills-hdr">
        <div>
          <div className="sk-title">Skills Library</div>
          <div className="sk-sub">Reusable knowledge blocks injected into agent prompts</div>
        </div>
        <button className="sk-new-btn" onClick={function() { setEditing('new') }}>+ New Skill</button>
      </div>

      {editing && (
        <SkillForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={function() { setEditing(null) }}
        />
      )}

      {CATS.map(function(cat) {
        const catSkills = skills.filter(function(s) { return s.category === cat })
        if (!catSkills.length) return null
        return (
          <div key={cat} className="skill-category">
            <div className="scat-label">{cat}</div>
            <div className="skill-grid">
              {catSkills.map(function(skill) {
                return (
                  <SkillCard key={skill.id} skill={skill} agents={agents}
                    agentConfigs={agentConfigs}
                    onEdit={function(s) { setEditing(s) }}
                    onDelete={handleDelete}
                    onToggleGlobal={handleToggleGlobal}
                    onToggleAgent={handleToggleAgent}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
