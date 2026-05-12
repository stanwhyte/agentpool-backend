// src/SkillsTab.jsx
import { useState } from 'react';

function uid() { return Math.random().toString(36).slice(2, 9); }

const SKILL_CATS = ['domain', 'tech', 'security', 'compliance', 'process', 'custom'];

function SkillCard({ skill, agentConfigs, agents, onEdit, onDelete, onToggleGlobal, onToggleAgent }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const assignedCount = agents.filter(a => (agentConfigs[a.id]?.skills || []).includes(skill.id)).length;

  return (
    <div className={`skill-card ${skill.global ? 'global' : ''}`} style={{ '--skc': skill.color }}>
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
        <button className="sk-act" onClick={() => onEdit(skill)}>✎</button>
        <button
          className={`sk-act ${skill.global ? 'sk-act-on' : ''}`}
          onClick={() => onToggleGlobal(skill.id)}
        >
          {skill.global ? '◉ Global' : '○ Global'}
        </button>
        <button
          className="sk-act sk-assign"
          onClick={() => setAssignOpen(o => !o)}
        >
          ⊕ Assign ({assignedCount})
        </button>
        {!skill.builtin && (
          <button className="sk-act sk-del" onClick={() => onDelete(skill.id)}>✕</button>
        )}
      </div>

      {assignOpen && (
        <div className="sk-assign-panel">
          <div className="sk-assign-title">Assign to agents:</div>
          <div className="sk-assign-agents">
            {agents.map(agent => {
              const has = (agentConfigs[agent.id]?.skills || []).includes(skill.id);
              return (
                <button
                  key={agent.id}
                  className={`sk-agent-btn ${has ? 'active' : ''}`}
                  style={has ? { borderColor: agent.color, color: agent.color, background: `${agent.color}15` } : {}}
                  onClick={() => onToggleAgent(agent.id, skill.id)}
                >
                  <span style={{ color: agent.color }}>{agent.icon}</span> {agent.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SkillForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: '', icon: '◆', color: '#00d4ff',
    category: 'custom', description: '', content: '', global: false,
  });

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="skill-form">
      <div className="sf-title">{initial ? 'Edit Skill' : 'New Skill'}</div>
      <div className="sf-grid">
        <div className="sf-field">
          <label className="sg-label">Name</label>
          <input className="sg-input sf-input" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Skill name" />
        </div>
        <div className="sf-field">
          <label className="sg-label">Icon</label>
          <input className="sg-input sf-input" value={form.icon} onChange={e => update('icon', e.target.value)} placeholder="◆" />
        </div>
        <div className="sf-field">
          <label className="sg-label">Color</label>
          <input className="sg-input sf-input" value={form.color} onChange={e => update('color', e.target.value)} placeholder="#00d4ff" />
        </div>
        <div className="sf-field">
          <label className="sg-label">Category</label>
          <select className="sg-input sf-input" value={form.category} onChange={e => update('category', e.target.value)}>
            {SKILL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="sf-field" style={{ marginBottom: 8 }}>
        <label className="sg-label">Description</label>
        <input className="sg-input sf-input" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Short description" />
      </div>
      <div className="sf-field">
        <label className="sg-label">Content (injected into agent prompt)</label>
        <textarea
          className="sf-textarea"
          rows={8}
          value={form.content}
          onChange={e => update('content', e.target.value)}
          placeholder="Write the skill content — appended to the agent's system prompt..."
        />
      </div>
      <div className="sf-field sg-toggle-field" style={{ marginTop: 10 }}>
        <div>
          <label className="sg-label">Global — inject into ALL agents</label>
        </div>
        <div
          className={`toggle ${form.global ? 'on' : ''}`}
          style={form.global ? { '--tc': '#00ffcc' } : {}}
          onClick={() => update('global', !form.global)}
        >
          <div className="tknob" />
        </div>
      </div>
      <div className="sf-actions">
        <button className="sf-save" onClick={() => { if (form.name && form.content) onSave(form); }}>Save</button>
        <button className="sf-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function SkillsTab({ skills, setSkills, agentConfigs, setAgentConfigs, agents }) {
  const [editing, setEditing] = useState(null); // null | 'new' | skill object

  const handleSave = (form) => {
    if (editing === 'new') {
      setSkills(p => [...p, { ...form, id: `custom-${uid()}`, builtin: false }]);
    } else {
      setSkills(p => p.map(s => s.id === editing.id ? { ...s, ...form } : s));
    }
    setEditing(null);
  };

  const handleDelete = (id) => {
    setSkills(p => p.filter(s => s.id !== id));
    setAgentConfigs(p => {
      const next = { ...p };
      Object.keys(next).forEach(aid => {
        if (next[aid]?.skills) {
          next[aid] = { ...next[aid], skills: next[aid].skills.filter(sid => sid !== id) };
        }
      });
      return next;
    });
  };

  const handleToggleGlobal = (id) => {
    setSkills(p => p.map(s => s.id === id ? { ...s, global: !s.global } : s));
  };

  const handleToggleAgent = (agentId, skillId) => {
    setAgentConfigs(p => {
      const cur = p[agentId]?.skills || [];
      const has = cur.includes(skillId);
      return { ...p, [agentId]: { ...p[agentId], skills: has ? cur.filter(s => s !== skillId) : [...cur, skillId] } };
    });
  };

  return (
    <div className="skills-page">
      <div className="skills-hdr">
        <div>
          <div className="sk-title">Skills Library</div>
          <div className="sk-sub">Reusable knowledge blocks injected into agent prompts</div>
        </div>
        <button className="sk-new-btn" onClick={() => setEditing('new')}>+ New Skill</button>
      </div>

      {editing && (
        <SkillForm
          initial={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {SKILL_CATS.map(cat => {
        const catSkills = skills.filter(s => s.category === cat);
        if (!catSkills.length) return null;
        return (
          <div key={cat} className="skill-category">
            <div className="scat-label">{cat}</div>
            <div className="skill-grid">
              {catSkills.map(skill => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  agents={agents}
                  agentConfigs={agentConfigs}
                  onEdit={s => setEditing(s)}
                  onDelete={handleDelete}
                  onToggleGlobal={handleToggleGlobal}
                  onToggleAgent={handleToggleAgent}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
