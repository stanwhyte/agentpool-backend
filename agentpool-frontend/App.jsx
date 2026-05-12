// src/App.jsx
// AgentPool v5 — Full 13-agent platform wired to live backend
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Login from './Login.jsx';
import { isLoggedIn, getUser, logout, streamAgent, getBudget, fetchRepoReadme, fetchRepoTree, sendNotification } from './api.js';

// ─── Model Registry ───────────────────────────────────────────────────────────
const MODELS = {
  'claude-sonnet-4-20250514':          { label:'Claude Sonnet 4',  provider:'anthropic',  costIn:3.00,  costOut:15.00, free:false },
  'claude-haiku-4-5-20251001':         { label:'Claude Haiku 4',   provider:'anthropic',  costIn:0.80,  costOut:4.00,  free:false },
  'gpt-4o':                            { label:'GPT-4o',           provider:'openai',     costIn:2.50,  costOut:10.00, free:false },
  'gpt-4o-mini':                       { label:'GPT-4o Mini',      provider:'openai',     costIn:0.15,  costOut:0.60,  free:false },
  'gemini-1.5-flash':                  { label:'Gemini Flash',     provider:'google',     costIn:0.075, costOut:0.30,  free:true  },
  'llama-3.3-70b-versatile':           { label:'Groq Llama 3.3',   provider:'groq',       costIn:0.00,  costOut:0.00,  free:true  },
  'llama-3.1-sonar-large-128k-online': { label:'Perplexity',       provider:'perplexity', costIn:1.00,  costOut:1.00,  free:false },
};

const DEFAULT_ROUTING = {
  scrum:'claude-sonnet-4-20250514', architect:'claude-sonnet-4-20250514',
  codegen:'gpt-4o', research:'llama-3.1-sonar-large-128k-online',
  reviewer:'claude-sonnet-4-20250514', tester:'gpt-4o-mini',
  docs:'gemini-1.5-flash', cybersec:'claude-sonnet-4-20250514',
  crypto:'claude-sonnet-4-20250514', commit:'gpt-4o-mini',
  devops:'gpt-4o', webdocs:'claude-sonnet-4-20250514', dataeng:'gpt-4o',
};

const DOWNGRADE = {
  'claude-sonnet-4-20250514':'claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001':'llama-3.3-70b-versatile',
  'gpt-4o':'gpt-4o-mini', 'gpt-4o-mini':'llama-3.3-70b-versatile',
  'gemini-1.5-flash':'llama-3.3-70b-versatile',
  'llama-3.1-sonar-large-128k-online':'llama-3.3-70b-versatile',
  'llama-3.3-70b-versatile':'llama-3.3-70b-versatile',
};

// ─── Agent Definitions ────────────────────────────────────────────────────────
const AGENT_DEFS = [
  { id:'scrum',     name:'Scrum Master',        label:'Orchestrator',        icon:'⬡', color:'#ffffff', avatar:'SM', isOrchestrator:true,
    systemPrompt:`You are a Senior Scrum Master and Technical Project Orchestrator. Given a technical requirement produce:
1. EPIC SUMMARY: One-sentence project scope
2. USER STORIES: 4-6 stories in "As a [user] I want [goal] so that [benefit]" format
3. SPRINT BACKLOG: Ordered tasks with agent assignments and story points (1/2/3/5/8)
4. DEPENDENCY MAP: Which tasks block others
5. RISK FLAGS: Missing info or ambiguities
6. DEFINITION OF DONE: Acceptance criteria
Be precise. Use markdown.`,
    synthPrompt:`You are a Senior Scrum Master reviewing all agent outputs. Produce:
1. EXECUTION PLAN: Ordered build steps integrating all recommendations
2. CONTRADICTIONS: Conflicts between agent outputs
3. CRITICAL PATH: Top 5 steps first
4. OPEN QUESTIONS: Needs human decision
5. SPRINT PLAN: 2-week breakdown
6. SIGN-OFF CHECKLIST: Before merging to main` },

  { id:'architect', name:'Architect',           label:'Tech Design',          icon:'◈', color:'#00d4ff', avatar:'AR',
    systemPrompt:`You are a Senior Software Architect. Produce:
1. ARCHITECTURE OVERVIEW: System design
2. TECH STACK: Technologies with justification
3. DATA MODELS: Entities and relationships
4. API CONTRACT: Key endpoints
5. SCALABILITY NOTES: Bottlenecks and solutions` },

  { id:'codegen',   name:'CodeGen',             label:'Code Generation',      icon:'⌥', color:'#00ff88', avatar:'CG',
    systemPrompt:`You are an elite software engineer. Produce:
1. IMPLEMENTATION PLAN: Build order
2. CORE CODE: Critical module implementation (well-commented)
3. FILE STRUCTURE: Directory layout
4. KEY ALGORITHMS: Non-trivial logic
5. DEPENDENCIES: Package list with versions` },

  { id:'research',  name:'Research',            label:'Docs & Research',      icon:'◎', color:'#ff9500', avatar:'RE',
    systemPrompt:`You are a Technical Research Specialist. Produce:
1. PRIOR ART: Existing solutions and libraries
2. BEST PRACTICES: Industry standards
3. SECURITY CONSIDERATIONS: Known vulnerabilities
4. PERFORMANCE BENCHMARKS: Expected characteristics
5. REFERENCES: Key documentation links` },

  { id:'reviewer',  name:'Reviewer',            label:'Code Review',          icon:'⊛', color:'#ff4560', avatar:'RV',
    systemPrompt:`You are a Senior Code Reviewer. Produce:
1. RISK ASSESSMENT: Threats with severity (Critical/High/Medium/Low)
2. CODE REVIEW CHECKLIST: What to verify
3. SECURITY CONTROLS: Auth, authorization, validation
4. COMMON PITFALLS: Anti-patterns to avoid
5. COMPLIANCE NOTES: GDPR, OWASP items` },

  { id:'tester',    name:'Tester',              label:'Test Generation',      icon:'⊡', color:'#b060ff', avatar:'TE',
    systemPrompt:`You are a QA Engineer. Produce:
1. TEST STRATEGY: Unit, integration, E2E levels
2. TEST CASES: 8-10 specific scenarios
3. EDGE CASES: Boundary conditions, error states
4. TEST CODE: Jest/Vitest sample with implementations
5. COVERAGE GOALS: Critical modules` },

  { id:'docs',      name:'Docs',                label:'Documentation',        icon:'❋', color:'#ffd700', avatar:'DO',
    systemPrompt:`You are a Technical Writer. Produce:
1. README DRAFT: Overview and quick start
2. API DOCUMENTATION: Endpoints with examples
3. ARCHITECTURE DIAGRAM: ASCII diagram
4. DEVELOPER GUIDE: Setup outline
5. CHANGELOG TEMPLATE: Version structure` },

  { id:'cybersec',  name:'CyberSec',            label:'Threat Modeling',      icon:'☠', color:'#ff6b35', avatar:'CS',
    systemPrompt:`You are a Senior Cybersecurity Analyst. Produce:
1. THREAT MODEL (STRIDE): All six categories
2. ATTACK SURFACE: Exploitable entry points
3. OWASP TOP 10: Applicable items
4. PENTEST SCENARIOS: 5 specific attack scenarios
5. MITIGATIONS: Concrete controls
6. INCIDENT RESPONSE: Response plan per threat` },

  { id:'crypto',    name:'Crypto & Compliance', label:'Cryptography · SOC 2', icon:'⚷', color:'#e040fb', avatar:'CC',
    systemPrompt:`You are a Cryptography Engineer and Compliance Specialist. Produce:
1. CRYPTO DESIGN: Algorithms, key sizes, protocols
2. KEY MANAGEMENT: Rotation, storage, escrow
3. DATA ENCRYPTION: At-rest and in-transit strategy
4. SOC 2 MAPPING: Trust Service Criteria
5. COMPLIANCE CONTROLS: SOC 2 Type II
6. AUDIT EVIDENCE: Logs and artifacts to retain` },

  { id:'commit',    name:'Commit Control',      label:'PR & Release Gate',    icon:'⎇', color:'#40c4ff', avatar:'CM',
    systemPrompt:`You are a Senior Git Workflow Engineer. Produce:
1. BRANCH STRATEGY: Naming, lifecycle, merge rules
2. COMMIT STANDARDS: Conventional commits
3. PR CHECKLIST: Reviewer requirements
4. CHANGE IMPACT: What could break
5. RELEASE NOTES: Changelog draft
6. ROLLBACK PLAN: Safe revert strategy` },

  { id:'devops',    name:'DevOps Engineer',     label:'CI/CD · Docker · IaC', icon:'⚙', color:'#00e5ff', avatar:'DV',
    systemPrompt:`You are a Senior DevOps Engineer. Produce:
1. GITHUB ACTIONS: Complete CI/CD workflow YAML
2. DOCKERFILE: Multi-stage production build
3. DOCKER COMPOSE: Local dev environment
4. TERRAFORM: DigitalOcean resource definitions
5. ENV TEMPLATE: .env.example with descriptions
6. HEALTH CHECKS: Monitoring config
7. ROLLBACK: Infrastructure revert strategy` },

  { id:'webdocs',   name:'Web & Docs',          label:'Website · API · SEO',  icon:'◉', color:'#69ff47', avatar:'WD',
    systemPrompt:`You are a Web Publisher and Documentation Specialist. Produce:
1. LANDING PAGE COPY: Hero, features, CTA sections
2. OPENAPI SPEC: OpenAPI 3.0 YAML for all endpoints
3. MINTLIFY CONFIG: docs.json structure
4. DOCS PIPELINE: GitHub Actions for auto-publish
5. SEO METADATA: Title, OG tags, JSON-LD
6. QUICKSTART: Shortest path to first API call
7. CHANGELOG ENTRY: Public changelog format` },

  { id:'dataeng',   name:'Data Engineer',       label:'Schema · Migrations',  icon:'⊞', color:'#ff9e80', avatar:'DE',
    systemPrompt:`You are a Senior Data Engineer. Produce:
1. SQL SCHEMA: CREATE TABLE with indexes and constraints
2. MIGRATIONS: Up and down migration files
3. SEED DATA: Development fixtures
4. QUERY OPTIMIZATION: Critical access paths
5. DATA RETENTION: Retention and archival policy
6. GDPR: Encryption and erasure support
7. BACKUP STRATEGY: Recovery config` },
];

// ─── Built-in Skills ──────────────────────────────────────────────────────────
const BUILTIN_SKILLS = [
  { id:'sentinel-ai', name:'SENTINEL-AI Core', icon:'◈', color:'#00d4ff', category:'domain', builtin:true, global:false,
    description:'Edge AI, Jetson Orin, blockchain L2 context',
    content:`PROJECT CONTEXT — SENTINEL-AI:
- Autonomous edge AI video analytics system
- Hardware: NVIDIA Jetson Orin
- Architecture: edge processing + blockchain L2 event logging
- Privacy-by-Design principles required
- B2B SaaS product model
- Polish NCBR INFOSTRATEG grant compliance required
- Always consider edge deployment constraints and privacy regulations` },

  { id:'go-backend', name:'Go Backend', icon:'⌥', color:'#00ff88', category:'tech', builtin:true, global:false,
    description:'Go idioms, Fiber, pgxpool, Redis, Asynq',
    content:`TECH STACK — GO BACKEND:
- Language: Go 1.22+
- HTTP: Fiber (fasthttp-based)
- DB: pgxpool for PostgreSQL connection pooling
- Cache: Redis with go-redis client
- Queue: Asynq for background jobs
- Observability: Prometheus + OpenTelemetry
- Auth: JWT with RS256
- Follow Go idioms: error wrapping, context propagation, interfaces` },

  { id:'soc2', name:'SOC 2 Ready', icon:'⚷', color:'#e040fb', category:'compliance', builtin:true, global:false,
    description:'Audit-first, evidence collection, controls',
    content:`COMPLIANCE — SOC 2 TYPE II:
- Build audit evidence from day one
- Log all: who did what, when, from where
- Encrypt at rest (AES-256-GCM) and in transit (TLS 1.3)
- RBAC with least-privilege
- Key rotation: 90-day schedule minimum
- Retain logs: 1 year minimum
- Map every control to CC6, CC7, CC8, CC9, A1, PI1
- Never store secrets in code or env vars in repo` },

  { id:'do-infra', name:'DigitalOcean Infrastructure', icon:'⚙', color:'#00e5ff', category:'tech', builtin:true, global:false,
    description:'DO droplets, managed DBs, Spaces, Terraform',
    content:`INFRASTRUCTURE — DIGITALOCEAN:
- Compute: Droplets (2vCPU/4GB for API)
- Database: DO Managed PostgreSQL with PgBouncer
- Cache: DO Managed Redis
- Storage: DO Spaces (S3-compatible)
- Region: Frankfurt (fra1)
- Terraform provider: digitalocean/digitalocean
- Current server: api.safecitysentinel.com` },

  { id:'owasp', name:'OWASP Top 10', icon:'☠', color:'#ff6b35', category:'security', builtin:true, global:false,
    description:'Full OWASP checklist for every feature',
    content:`SECURITY — OWASP TOP 10 (2021):
A01: Broken Access Control — verify on every endpoint
A02: Cryptographic Failures — no MD5/SHA1, use AES-256/ChaCha20
A03: Injection — parameterized queries only
A04: Insecure Design — threat model before coding
A05: Security Misconfiguration — no defaults in prod
A06: Vulnerable Components — run npm audit / govulncheck
A07: Auth Failures — MFA, secure sessions
A08: Integrity Failures — verify checksums, sign artifacts
A09: Logging Failures — log security events, not sensitive data
A10: SSRF — validate all URLs, block internal ranges` },

  { id:'polish', name:'Polish Legal & Grant', icon:'⬡', color:'#ffd700', category:'domain', builtin:true, global:false,
    description:'NCBR grant, Polish law, JDG requirements',
    content:`LEGAL CONTEXT — POLAND:
- Entity: JDG sole proprietor under SENTINEL-AI brand
- Grant: NCBR INFOSTRATEG IX — all deliverables must align
- IP Box: qualify R&D for 5% CIT rate
- Documentation language: Polish for formal docs
- Data law: RODO (GDPR Polish implementation)
- Prefer approaches that produce auditable evidence` },
];

// ─── Message Types ────────────────────────────────────────────────────────────
const MSG_TYPES = {
  status:   { label:'Status',   color:'#3a5060', bg:'transparent' },
  finding:  { label:'Finding',  color:'#00d4ff', bg:'rgba(0,212,255,.05)' },
  conflict: { label:'Conflict', color:'#ff4560', bg:'rgba(255,69,96,.06)' },
  handoff:  { label:'Handoff',  color:'#00ff88', bg:'rgba(0,255,136,.05)' },
  warning:  { label:'Warning',  color:'#ff9500', bg:'rgba(255,149,0,.05)' },
  complete: { label:'Complete', color:'#b060ff', bg:'rgba(176,96,255,.05)' },
  user:     { label:'You',      color:'#ffffff', bg:'rgba(255,255,255,.04)' },
  system:   { label:'System',   color:'#3a5060', bg:'transparent' },
  reply:    { label:'Reply',    color:'#00ffcc', bg:'rgba(0,255,204,.05)' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid()  { return Math.random().toString(36).slice(2,9); }
function ts()   { return new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function estimateTokens(t) { return Math.ceil((t||'').length/4); }
function estimateCost(mk,i,o) {
  const m=MODELS[mk]; if(!m) return 0;
  return (i/1e6)*m.costIn+(o/1e6)*m.costOut;
}
function resolveModel(agentId, routing, budget, spent) {
  const assigned = routing[agentId]||'claude-sonnet-4-20250514';
  const pct = budget.sessionBudget>0 ? spent/budget.sessionBudget : 0;
  if (budget.autoDowngrade) {
    if (pct>=0.85) return DOWNGRADE[assigned]||'llama-3.3-70b-versatile';
    if (pct>=0.60 && MODELS[assigned]?.costIn>1) return DOWNGRADE[assigned]||assigned;
  }
  return assigned;
}

function buildPrompt(agent, cfg, skills) {
  let sys = agent.systemPrompt;
  const adds = [];
  const activeIds = [
    ...skills.filter(s=>s.global).map(s=>s.id),
    ...(cfg?.skills||[])
  ];
  [...new Set(activeIds)].forEach(sid => {
    const sk = skills.find(s=>s.id===sid);
    if (sk) adds.push(`--- SKILL: ${sk.name} ---\n${sk.content}`);
  });
  if (cfg?.techStack)          adds.push(`TECH STACK:\n${cfg.techStack}`);
  if (cfg?.repoContext)        adds.push(`CODEBASE README:\n${cfg.repoContext.readme}\n\nFILE TREE:\n${cfg.repoContext.fileTree}`);
  if (cfg?.customInstructions) adds.push(`ADDITIONAL INSTRUCTIONS:\n${cfg.customInstructions}`);
  if (cfg?.overrideMode && cfg?.customInstructions) return cfg.customInstructions;
  return adds.length ? sys+'\n\n---\n\n'+adds.join('\n\n') : sys;
}

function md(text) {
  if (!text) return '';
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g,(_,l,c)=>`<pre class="cb"><code>${c.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`)
    .replace(/`([^`]+)`/g,`<code class="ic">$1</code>`)
    .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm,'<li>$1</li>').replace(/^\d+\. (.+)$/gm,"<li class='n'>$1</li>")
    .replace(/\n\n/g,'</p><p>')
    .replace(/^(?!<[hplic])(.+)$/gm,m=>m.startsWith('<')?m:`<p>${m}</p>`);
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
function ChatMsg({ msg, agents, onPin, onReact, pinned }) {
  const agent = agents.find(a=>a.id===msg.agentId);
  const typeStyle = MSG_TYPES[msg.type]||MSG_TYPES.status;
  const isSystem = msg.type==='system';
  const [expanded, setExpanded] = useState(false);
  const isLong = (msg.text||'').length > 280;
  return (
    <div className={`cmsg ${msg.type} ${pinned?'pinned':''}`} style={{'--mc':agent?.color||typeStyle.color, background:typeStyle.bg}}>
      {!isSystem && (
        <div className="cmsg-hdr">
          <div className="cmsg-avatar" style={{background:`${agent?.color||typeStyle.color}22`,border:`1px solid ${agent?.color||typeStyle.color}55`,color:agent?.color||typeStyle.color}}>
            {msg.type==='user'?'YOU':agent?.avatar||'??'}
          </div>
          <div className="cmsg-meta">
            <span className="cmsg-name" style={{color:agent?.color||typeStyle.color}}>
              {msg.type==='user'?'You':agent?.name||msg.agentId}
            </span>
            {msg.toAgent && <span className="cmsg-to">→ <span style={{color:agents.find(a=>a.id===msg.toAgent)?.color||'#888'}}>@{agents.find(a=>a.id===msg.toAgent)?.name||msg.toAgent}</span></span>}
            <span className="cmsg-type" style={{color:typeStyle.color,borderColor:`${typeStyle.color}44`}}>{typeStyle.label}</span>
          </div>
          <span className="cmsg-ts">{msg.ts}</span>
          <div className="cmsg-actions">
            <button className={`cmsg-act ${pinned?'active':''}`} onClick={()=>onPin(msg.id)}>📌</button>
            <button className={`cmsg-act ${msg.reaction==='👍'?'active':''}`} onClick={()=>onReact(msg.id,'👍')}>👍</button>
            <button className={`cmsg-act ${msg.reaction==='🚩'?'active':''}`} onClick={()=>onReact(msg.id,'🚩')}>🚩</button>
          </div>
        </div>
      )}
      <div className={`cmsg-body ${isSystem?'cmsg-sys':''}`}>
        {isSystem
          ? <span style={{color:'#3a5060',fontSize:10}}>— {msg.text} —</span>
          : <>
              <div dangerouslySetInnerHTML={{__html:md(isLong&&!expanded?msg.text.slice(0,280)+'...':msg.text)}}/>
              {isLong && <button className="expand-txt" onClick={()=>setExpanded(e=>!e)}>{expanded?'▲ collapse':'▼ read more'}</button>}
            </>}
      </div>
      {msg.reaction && <div className="cmsg-reaction">{msg.reaction}</div>}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────
function ChatPanel({ messages, agents, onSend, isRunning, pinnedIds, onPin, onReact, filter, setFilter }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const [showPinned, setShowPinned] = useState(false);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[messages]);

  const filtered = useMemo(()=>{
    let msgs = showPinned ? messages.filter(m=>pinnedIds.has(m.id)) : messages;
    if (filter==='conflicts') msgs=msgs.filter(m=>m.type==='conflict'||m.type==='warning');
    else if (filter==='findings') msgs=msgs.filter(m=>m.type==='finding'||m.type==='complete');
    else if (filter==='handoffs') msgs=msgs.filter(m=>m.type==='handoff');
    else if (filter!=='all') msgs=msgs.filter(m=>m.agentId===filter||m.type==='user'||m.type==='system');
    return msgs;
  },[messages,filter,showPinned,pinnedIds]);

  const send = () => { const t=input.trim(); if(!t) return; onSend(t); setInput(''); };
  const mentionMatch = input.match(/^@(\w+)/);
  const mentionedAgent = mentionMatch ? agents.find(a=>a.name.toLowerCase().startsWith(mentionMatch[1].toLowerCase())) : null;

  return (
    <div className="chat-panel">
      <div className="chat-hdr">
        <div className="chat-title"><span style={{color:'#00d4ff'}}>◈</span> Agent Channel {isRunning&&<span className="live-badge">● LIVE</span>}</div>
        <button className={`chat-pin-btn ${showPinned?'active':''}`} onClick={()=>setShowPinned(p=>!p)}>📌 {pinnedIds.size}</button>
      </div>
      <div className="chat-filters">
        {[['all','All'],['conflicts','⚠ Conflicts'],['findings','◈ Findings'],['handoffs','→ Handoffs']].map(([id,label])=>(
          <button key={id} className={`cf-btn ${filter===id?'active':''}`} onClick={()=>setFilter(id)}>{label}</button>
        ))}
        <div className="cf-div"/>
        {agents.filter(a=>!a.isOrchestrator).map(a=>(
          <button key={a.id} className={`cf-btn ${filter===a.id?'active':''}`}
            style={filter===a.id?{borderColor:a.color,color:a.color}:{}} onClick={()=>setFilter(filter===a.id?'all':a.id)}>
            <span style={{color:a.color}}>{a.icon}</span>
          </button>
        ))}
      </div>
      <div className="chat-messages">
        {filtered.length===0&&<div className="chat-empty"><div className="ce-icon">◈</div><div>{messages.length===0?'Deploy agents to start':'No messages match filter'}</div></div>}
        {filtered.map(msg=><ChatMsg key={msg.id} msg={msg} agents={agents} onPin={onPin} onReact={onReact} pinned={pinnedIds.has(msg.id)}/>)}
        <div ref={bottomRef}/>
      </div>
      {mentionedAgent&&<div className="mention-hint" style={{borderColor:mentionedAgent.color}}><span style={{color:mentionedAgent.color}}>{mentionedAgent.icon}</span> Directing to <strong style={{color:mentionedAgent.color}}>{mentionedAgent.name}</strong> {isRunning?' — live interrupt':' — re-run after'}</div>}
      <div className="chat-input-row">
        <div className="chat-input-wrap">
          <textarea className="chat-input" placeholder={isRunning?'@AgentName to interrupt...':'@AgentName to re-prompt...'} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} rows={2}/>
          <button className="chat-send" onClick={send} disabled={!input.trim()}>↑</button>
        </div>
        <div className="chat-hint">Enter to send · Shift+Enter newline · @name to direct</div>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────
function AgentCard({ agent, status, output, progress, modelKey, cost, onExpand }) {
  const m = MODELS[modelKey];
  return (
    <div className={`acard ${status}`} style={{'--ac':agent.color}}>
      <div className="acard-bar">{(status==='streaming'||status==='done')&&<div className="acard-fill" style={{width:`${status==='done'?100:progress}%`,background:agent.color}}/>}</div>
      <div className="acard-hdr">
        <span style={{color:agent.color,fontSize:15,width:20,textAlign:'center',flexShrink:0}}>{agent.icon}</span>
        <div className="acard-meta"><div className="acard-name">{agent.name}</div><div className="acard-lbl">{agent.label}</div></div>
        <div className="acard-right">
          {m&&<span className="model-tag" style={{borderColor:m.free?'#00ffcc':'#1e3040',color:m.free?'#00ffcc':'#3a5060'}}>{m.free?'✦ ':''}{m.label}</span>}
          {cost>0&&<span className="cost-tag">${cost.toFixed(4)}</span>}
          <span className={`sdot ${status}`}/>
        </div>
      </div>
      <div className="acard-body">
        {status==='idle'&&<div className="ph"><span style={{color:agent.color,opacity:.18}}>{agent.icon}</span><span>Awaiting...</span></div>}
        {status==='waiting'&&<div className="ph pulse"><span style={{color:agent.color}}>◌</span><span>Routing...</span></div>}
        {(status==='streaming'||status==='done')&&output&&<div className="out" dangerouslySetInnerHTML={{__html:md(output)}}/>}
        {status==='error'&&<div className="out-err">⚠ {output}</div>}
      </div>
      {status==='done'&&<div className="acard-foot"><span style={{color:agent.color}}>✓</span><span>{output?.split(' ').length||0}w</span><button className="expand-btn" onClick={()=>onExpand(agent.id)}>EXPAND ↗</button></div>}
    </div>
  );
}

// ─── Skills Tab ───────────────────────────────────────────────────────────────
function SkillsTab({ skills, setSkills, agentConfigs, setAgentConfigs }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({name:'',icon:'◆',color:'#00d4ff',category:'custom',description:'',content:'',global:false});
  const [assignOpen, setAssignOpen] = useState(null);

  const saveSkill = () => {
    if (!form.name.trim()||!form.content.trim()) return;
    if (editing==='new') setSkills(p=>[...p,{...form,id:`custom-${uid()}`,builtin:false}]);
    else setSkills(p=>p.map(s=>s.id===editing?{...s,...form}:s));
    setEditing(null);
  };

  const toggleAgentSkill = (agentId, skillId) => {
    setAgentConfigs(p=>{
      const cur=(p[agentId]?.skills||[]);
      return {...p,[agentId]:{...p[agentId],skills:cur.includes(skillId)?cur.filter(s=>s!==skillId):[...cur,skillId]}};
    });
  };

  const cats = ['domain','tech','security','compliance','process','custom'];

  return (
    <div className="skills-page">
      <div className="skills-hdr">
        <div><div className="sk-title">Skills Library</div><div className="sk-sub">Reusable knowledge blocks injected into agent prompts</div></div>
        <button className="sk-new-btn" onClick={()=>{setEditing('new');setForm({name:'',icon:'◆',color:'#00d4ff',category:'custom',description:'',content:'',global:false});}}>+ New Skill</button>
      </div>
      {editing&&(
        <div className="skill-form">
          <div className="sf-title">{editing==='new'?'New Skill':'Edit Skill'}</div>
          <div className="sf-grid">
            {[['Name','name','Skill name'],['Icon','icon','◆'],['Color','color','#00d4ff']].map(([label,key,ph])=>(
              <div key={key} className="sf-field"><label className="sg-label">{label}</label><input className="sg-input sf-input" value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}/></div>
            ))}
            <div className="sf-field"><label className="sg-label">Category</label>
              <select className="sg-input sf-input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {cats.map(c=><option key={c} value={c}>{c}</option>)}
              </select></div>
          </div>
          <div className="sf-field" style={{marginBottom:8}}><label className="sg-label">Description</label><input className="sg-input sf-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Short description"/></div>
          <div className="sf-field"><label className="sg-label">Content (injected into agent prompt)</label><textarea className="sf-textarea" rows={8} value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="Write the skill content..."/></div>
          <div className="sf-field sg-toggle-field" style={{marginTop:10}}>
            <div><label className="sg-label">Global — inject into ALL agents</label></div>
            <div className={`toggle ${form.global?'on':''}`} style={form.global?{'--tc':'#00ffcc'}:{}} onClick={()=>setForm(f=>({...f,global:!f.global}))}><div className="tknob"/></div>
          </div>
          <div className="sf-actions"><button className="sf-save" onClick={saveSkill}>Save</button><button className="sf-cancel" onClick={()=>setEditing(null)}>Cancel</button></div>
        </div>
      )}
      {cats.map(cat=>{
        const catSkills=skills.filter(s=>s.category===cat); if(!catSkills.length) return null;
        return(
          <div key={cat} className="skill-category">
            <div className="scat-label">{cat}</div>
            <div className="skill-grid">
              {catSkills.map(skill=>(
                <div key={skill.id} className={`skill-card ${skill.global?'global':''}`} style={{'--skc':skill.color}}>
                  <div className="sk-card-hdr">
                    <span className="sk-card-icon" style={{color:skill.color}}>{skill.icon}</span>
                    <div><div className="sk-card-name">{skill.name}</div><div className="sk-card-desc">{skill.description}</div></div>
                    {skill.global&&<span className="sk-global">GLOBAL</span>}
                  </div>
                  <div className="sk-card-preview">{skill.content.slice(0,100)}...</div>
                  <div className="sk-card-actions">
                    <button className="sk-act" onClick={()=>{setEditing(skill.id);setForm({...skill});}}>✎</button>
                    <button className={`sk-act ${skill.global?'sk-act-on':''}`} onClick={()=>setSkills(p=>p.map(s=>s.id===skill.id?{...s,global:!s.global}:s))}>
                      {skill.global?'◉ Global':'○ Global'}
                    </button>
                    <button className="sk-act sk-assign" onClick={()=>setAssignOpen(assignOpen===skill.id?null:skill.id)}>
                      ⊕ Assign ({AGENT_DEFS.filter(a=>agentConfigs[a.id]?.skills?.includes(skill.id)).length})
                    </button>
                    {!skill.builtin&&<button className="sk-act sk-del" onClick={()=>setSkills(p=>p.filter(s=>s.id!==skill.id))}>✕</button>}
                  </div>
                  {assignOpen===skill.id&&(
                    <div className="sk-assign-panel">
                      <div className="sk-assign-title">Assign to agents:</div>
                      <div className="sk-assign-agents">
                        {AGENT_DEFS.map(agent=>{
                          const has=(agentConfigs[agent.id]?.skills||[]).includes(skill.id);
                          return <button key={agent.id} className={`sk-agent-btn ${has?'active':''}`} style={has?{borderColor:agent.color,color:agent.color,background:`${agent.color}15`}:{}} onClick={()=>toggleAgentSkill(agent.id,skill.id)}><span style={{color:agent.color}}>{agent.icon}</span> {agent.name}</button>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────
function ConfigTab({ configs, setConfigs, skills, routing, setRouting, budgetSettings, setBudgetSettings, user }) {
  const [open, setOpen] = useState(null);
  const [fetching, setFetching] = useState({});
  const [fetchMsg, setFetchMsg] = useState({});
  const [newUser, setNewUser] = useState({username:'',password:'',role:'developer'});
  const [userMsg, setUserMsg] = useState('');

  const handleFetch = async(id) => {
    const url=configs[id]?.repoUrl; if(!url) return;
    setFetching(f=>({...f,[id]:true}));
    try {
      const m=url.match(/github\.com\/([^/]+)\/([^/\s]+)/);
      if(m){
        const [,owner,repo]=m, clean=repo.replace(/\.git$/,'');
        const [rr,tr]=await Promise.all([fetchRepoReadme(owner,clean),fetchRepoTree(owner,clean)]);
        setConfigs(p=>({...p,[id]:{...p[id],repoContext:{readme:rr.readme,fileTree:tr.files?.join('\n')||''}}}));
        setFetchMsg(m=>({...m,[id]:`✓ ${tr.files?.length||0} files`}));
      }
    } catch(e){setFetchMsg(m=>({...m,[id]:`⚠ ${e.message}`}));}
    setFetching(f=>({...f,[id]:false}));
  };

  return (
    <div className="settings-page">
      {/* Budget */}
      <div className="settings-section">
        <div className="ss-title">Budget & Auto-Routing</div>
        <div className="settings-grid">
          {[['Session Budget (USD)','sessionBudget',0.10],['Monthly Budget (USD)','monthlyBudget',1]].map(([label,key,step])=>(
            <div key={key} className="sg-field">
              <label className="sg-label">{label}</label>
              <div className="sg-input-row"><span className="sg-prefix">$</span>
                <input className="sg-input" type="number" min="0" step={step} value={budgetSettings[key]} onChange={e=>setBudgetSettings(p=>({...p,[key]:parseFloat(e.target.value)||0}))}/>
              </div>
            </div>
          ))}
          {[['Auto-Downgrade Models','autoDowngrade'],['Prefer Free Tiers','preferFree']].map(([label,key])=>(
            <div key={key} className="sg-field sg-toggle-field">
              <label className="sg-label">{label}</label>
              <div className={`toggle ${budgetSettings[key]?'on':''}`} onClick={()=>setBudgetSettings(p=>({...p,[key]:!p[key]}))}><div className="tknob"/></div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Routing */}
      <div className="settings-section">
        <div className="ss-title">Model Routing</div>
        <div className="routing-config">
          {AGENT_DEFS.map(agent=>{
            const cur=routing[agent.id]||'claude-sonnet-4-20250514', m=MODELS[cur];
            return(
              <div key={agent.id} className="rc-row">
                <span style={{color:agent.color,fontSize:14,width:20,textAlign:'center',flexShrink:0}}>{agent.icon}</span>
                <div className="rc-meta"><div className="rc-name">{agent.name}</div><div className="rc-lbl">{agent.label}</div></div>
                <select className="rc-select" value={cur} style={{borderColor:m?.free?'#00ffcc':'var(--bd)'}} onChange={e=>setRouting(r=>({...r,[agent.id]:e.target.value}))}>
                  {Object.entries(MODELS).map(([key,mod])=><option key={key} value={key}>{mod.free?'✦ ':''}{mod.label} — ${mod.costIn}/${mod.costOut}/1M</option>)}
                </select>
                <span className="rc-cost">{m?.free?<span style={{color:'#00ffcc'}}>FREE</span>:<span style={{color:'#3a5060'}}>${m?.costIn}</span>}</span>
              </div>
            );
          })}
        </div>
        <button className="reset-btn" onClick={()=>setRouting(DEFAULT_ROUTING)}>↺ Reset Defaults</button>
      </div>

      {/* Agent Config */}
      <div className="settings-section">
        <div className="ss-title">Per-Agent Configuration</div>
        <div className="agent-cfg-list">
          {AGENT_DEFS.map(agent=>{
            const cfg=configs[agent.id]||{}, isOpen=open===agent.id;
            const activeSkills=skills.filter(s=>(cfg.skills||[]).includes(s.id)||s.global);
            return(
              <div key={agent.id} className={`acfg-card ${isOpen?'open':''}`} style={{'--ac':agent.color}}>
                <div className="acfg-row" onClick={()=>setOpen(isOpen?null:agent.id)}>
                  <span style={{color:agent.color,fontSize:15}}>{agent.icon}</span>
                  <div style={{flex:1}}><div className="acfg-name">{agent.name}</div><div className="acfg-lbl">{agent.label}</div></div>
                  <div className="acfg-tags">
                    {cfg.repoUrl&&<span className="cfg-tag">repo</span>}
                    {cfg.customInstructions&&<span className="cfg-tag">custom</span>}
                    {activeSkills.length>0&&<span className="cfg-tag" style={{borderColor:agent.color,color:agent.color}}>{activeSkills.length} skills</span>}
                  </div>
                  <span className="acfg-chev">{isOpen?'▲':'▼'}</span>
                </div>
                {isOpen&&(
                  <div className="acfg-panel">
                    {activeSkills.length>0&&<div className="acfg-field"><label className="sg-label">Active Skills</label><div className="active-skills">{activeSkills.map(sk=><span key={sk.id} className="active-skill-chip" style={{borderColor:sk.color,color:sk.color}}>{sk.icon} {sk.name}</span>)}</div></div>}
                    <div className="acfg-field"><label className="sg-label">GitHub Repo URL</label>
                      <div className="sg-input-row">
                        <input className="sg-input" style={{flex:1}} placeholder="https://github.com/owner/repo" value={cfg.repoUrl||''} onChange={e=>setConfigs(p=>({...p,[agent.id]:{...p[agent.id],repoUrl:e.target.value}}))}/>
                        <button className="fetch-btn" onClick={()=>handleFetch(agent.id)} disabled={fetching[agent.id]||!cfg.repoUrl}>{fetching[agent.id]?'◌':'FETCH'}</button>
                      </div>
                      {fetchMsg[agent.id]&&<div className="fetch-msg">{fetchMsg[agent.id]}</div>}
                    </div>
                    <div className="acfg-field"><label className="sg-label">Tech Stack</label><input className="sg-input" placeholder="Go, PostgreSQL, Redis..." value={cfg.techStack||''} onChange={e=>setConfigs(p=>({...p,[agent.id]:{...p[agent.id],techStack:e.target.value}})}/></div>
                    <div className="acfg-field"><label className="sg-label">Custom Instructions</label><textarea className="sg-textarea" rows={3} placeholder="Additional instructions..." value={cfg.customInstructions||''} onChange={e=>setConfigs(p=>({...p,[agent.id]:{...p[agent.id],customInstructions:e.target.value}})}/></div>
                    <div className="acfg-field sg-toggle-field">
                      <div><label className="sg-label">Override Mode</label><div className="sg-hint">Replace base prompt entirely</div></div>
                      <div className={`toggle ${cfg.overrideMode?'on':''}`} style={cfg.overrideMode?{'--tc':agent.color}:{}} onClick={()=>setConfigs(p=>({...p,[agent.id]:{...p[agent.id],overrideMode:!cfg.overrideMode}}))}><div className="tknob"/></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Team (owner only) */}
      {user?.role==='owner'&&(
        <div className="settings-section">
          <div className="ss-title">Team Members</div>
          <div className="team-form">
            <input className="sg-input" placeholder="username" value={newUser.username} onChange={e=>setNewUser(p=>({...p,username:e.target.value}))}/>
            <input className="sg-input" type="password" placeholder="password (12+ chars)" value={newUser.password} onChange={e=>setNewUser(p=>({...p,password:e.target.value}))}/>
            <select className="sg-input" value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}>
              {['owner','developer','reviewer','auditor'].map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <button className="sf-save" onClick={async()=>{
              try { const {createUser}=await import('./api.js'); await createUser(newUser.username,newUser.password,newUser.role); setUserMsg(`✓ Created ${newUser.username}`); setNewUser({username:'',password:'',role:'developer'}); } catch(e){setUserMsg(`⚠ ${e.message}`);}
            }}>Add User</button>
          </div>
          {userMsg&&<div className="fetch-msg" style={{margin:'8px 0'}}>{userMsg}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,       setUser]       = useState(isLoggedIn()?getUser():null);
  const [page,       setPage]       = useState('run');
  const [requirement,setRequirement]= useState('');
  const [routing,    setRouting]    = useState(DEFAULT_ROUTING);
  const [budgetSettings, setBudgetSettings] = useState({sessionBudget:0.50,monthlyBudget:15,autoDowngrade:true,preferFree:true});
  const [agentConfigs, setAgentConfigs] = useState({});
  const [skills,     setSkills]     = useState(BUILTIN_SKILLS.map(s=>({...s})));
  const [agentStates,setAgentStates]= useState(()=>Object.fromEntries(AGENT_DEFS.map(a=>[a.id,{status:'idle',output:'',progress:0,model:null,cost:0}])));
  const [messages,   setMessages]   = useState([]);
  const [chatFilter, setChatFilter] = useState('all');
  const [pinnedIds,  setPinnedIds]  = useState(new Set());
  const [scrumPlan,  setScrumPlan]  = useState('');
  const [scrumSynth, setScrumSynth] = useState('');
  const [scrumPlanPhase, setScrumPlanPhase] = useState(null);
  const [scrumSynthPhase,setScrumSynthPhase]= useState(null);
  const [isRunning,  setIsRunning]  = useState(false);
  const [sessionSpent,setSessionSpent]=useState(0);
  const [sessions,   setSessions]   = useState([]);
  const [modal,      setModal]      = useState(null);
  const [chatSplit,  setChatSplit]  = useState(38);
  const [userInterrupts,setUserInterrupts]=useState([]);

  const agentStatesRef    = useRef(agentStates);
  const sessionSpentRef   = useRef(0);
  const isRunningRef      = useRef(isRunning);
  const userInterruptsRef = useRef(userInterrupts);
  const sessionId         = useRef(uid());

  useEffect(()=>{ agentStatesRef.current=agentStates; },[agentStates]);
  useEffect(()=>{ isRunningRef.current=isRunning; },[isRunning]);
  useEffect(()=>{ userInterruptsRef.current=userInterrupts; },[userInterrupts]);

  const workerAgents = AGENT_DEFS.filter(a=>!a.isOrchestrator);
  const scrumAgent   = AGENT_DEFS.find(a=>a.isOrchestrator);

  const updateAgent = useCallback((id,patch)=>setAgentStates(p=>({...p,[id]:{...p[id],...patch}})),[]);
  const addCost     = useCallback(amt=>{ sessionSpentRef.current+=amt; setSessionSpent(sessionSpentRef.current); },[]);
  const addMsg      = useCallback((agentId,type,text,toAgent=null)=>{
    const msg={id:uid(),agentId,type,text,toAgent,ts:ts(),reaction:null};
    setMessages(p=>[...p,msg]); return msg.id;
  },[]);

  const handlePin   = useCallback(id=>setPinnedIds(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;}),[]);
  const handleReact = useCallback((id,r)=>setMessages(p=>p.map(m=>m.id===id?{...m,reaction:m.reaction===r?null:r}:m)),[]);

  const handleUserMessage = useCallback(async(text)=>{
    addMsg('user','user',text);
    const mentionMatch=text.match(/^@(\w+)\s+(.*)/s);
    if(mentionMatch){
      const [,name,instruction]=mentionMatch;
      const target=workerAgents.find(a=>a.name.toLowerCase().startsWith(name.toLowerCase()));
      if(target){
        if(isRunningRef.current){
          setUserInterrupts(p=>[...p,{agentId:target.id,text:instruction,ts:Date.now()}]);
          addMsg('system','system',`Interrupt queued for ${target.name}`);
        } else {
          addMsg('system','system',`Re-running ${target.name}...`);
          updateAgent(target.id,{status:'streaming',output:'',progress:5,model:routing[target.id]});
          try{
            const mk=routing[target.id]||'claude-sonnet-4-20250514';
            const sys=buildPrompt(target,agentConfigs[target.id],skills);
            let out='';
            addMsg(target.id,'status',`Received: "${instruction.slice(0,80)}"`);
            await streamAgent({model:mk,system:sys,messages:[{role:'user',content:`Requirement: ${requirement}\n\nInstruction: ${instruction}`}],agentId:target.id,sessionId:sessionId.current,onChunk:chunk=>{out+=chunk;updateAgent(target.id,{output:out,progress:Math.min(95,5+(out.length/2000)*90)});}});
            updateAgent(target.id,{status:'done',output:out,progress:100});
            addMsg(target.id,'complete',`Re-run complete — ${out.split(' ').length}w`);
          }catch(e){updateAgent(target.id,{status:'error',output:e.message});addMsg(target.id,'warning',e.message);}
        }
      }
    }
  },[addMsg,workerAgents,requirement,routing,agentConfigs,skills,updateAgent]);

  const runAll = useCallback(async()=>{
    if(!requirement.trim()||isRunning) return;
    setIsRunning(true); setModal(null);
    setScrumPlan(''); setScrumSynth('');
    setScrumPlanPhase(null); setScrumSynthPhase(null);
    sessionSpentRef.current=0; setSessionSpent(0);
    sessionId.current=uid();
    setMessages([]); setUserInterrupts([]);
    workerAgents.forEach(a=>updateAgent(a.id,{status:'idle',output:'',progress:0,model:null,cost:0}));
    const sessionAgentCosts={};

    addMsg('system','system',`Session started — ${workerAgents.length} agents deploying`);
    addMsg('scrum','status','Analyzing requirement and building sprint plan...');

    // Phase 1 — Scrum planning
    setScrumPlanPhase('active');
    try{
      const sys=buildPrompt(scrumAgent,agentConfigs.scrum,skills);
      let plan='';
      await streamAgent({model:routing.scrum||'claude-sonnet-4-20250514',system:sys,messages:[{role:'user',content:`Technical Requirement:\n\n${requirement}`}],agentId:'scrum',sessionId:sessionId.current,onChunk:chunk=>{plan+=chunk;setScrumPlan(plan);}});
      addMsg('scrum','finding',`Sprint plan ready — ${plan.split(' ').length}w. Dispatching agents...`);
    }catch(e){setScrumPlan(`⚠ ${e.message}`);addMsg('scrum','warning',e.message);}
    setScrumPlanPhase('done');

    // Phase 2 — Workers parallel
    addMsg('system','system','All agents dispatched — running in parallel');
    workerAgents.forEach(a=>updateAgent(a.id,{status:'waiting',progress:0}));

    await Promise.allSettled(workerAgents.map(async agent=>{
      const mk=resolveModel(agent.id,routing,budgetSettings,sessionSpentRef.current);
      updateAgent(agent.id,{status:'streaming',progress:5,model:mk});
      addMsg(agent.id,'status',`Starting with ${MODELS[mk]?.label||mk}...`);
      try{
        const sys=buildPrompt(agent,agentConfigs[agent.id],skills);
        let out='', chars=0, lastCheck=Date.now();
        await streamAgent({model:mk,system:sys,messages:[{role:'user',content:`Technical Requirement:\n\n${requirement}\n\nProvide your specialized analysis. Prefix key findings with "NOTE FOR TEAM:"`}],agentId:agent.id,sessionId:sessionId.current,
          onChunk:chunk=>{
            out+=chunk; chars+=chunk.length;
            updateAgent(agent.id,{output:out,progress:Math.min(95,5+(chars/2000)*90)});
            if(Date.now()-lastCheck>2000){
              lastCheck=Date.now();
              const myInt=userInterruptsRef.current.filter(i=>i.agentId===agent.id&&i.ts>Date.now()-30000);
              if(myInt.length){addMsg(agent.id,'reply',`Acknowledged: "${myInt[myInt.length-1].text.slice(0,60)}"`);setUserInterrupts(p=>p.filter(i=>i.agentId!==agent.id));}
            }
            if(out.includes('NOTE FOR TEAM:')&&!out.slice(0,-chunk.length).includes('NOTE FOR TEAM:')){
              const m=out.match(/NOTE FOR TEAM:([^\n]+)/);
              if(m) addMsg(agent.id,'finding',`📢 ${m[1].trim()}`);
            }
          }
        });
        const fc=estimateCost(mk,estimateTokens(sys),estimateTokens(out));
        sessionAgentCosts[agent.id]=fc; addCost(fc);
        updateAgent(agent.id,{status:'done',output:out,progress:100,cost:fc});
        addMsg(agent.id,'complete',`Done — ${out.split(' ').length}w · $${fc.toFixed(5)}`);
        if(agent.id==='reviewer'&&(out.toLowerCase().includes('critical')||out.toLowerCase().includes('vulnerability')))
          addMsg(agent.id,'conflict','⚠ Critical security findings — CyberSec and Crypto agents should review before implementation');
        if(agent.id==='architect') addMsg(agent.id,'handoff','Architecture ready → CodeGen can begin · Data Engineer should align schema');
        if(agent.id==='dataeng')   addMsg(agent.id,'handoff','Schema ready → CodeGen can reference data layer · Docs should document schema');
        if(agent.id==='devops')    addMsg(agent.id,'handoff','CI/CD pipeline ready → Commit Control should verify alignment');
        // Fire notifications for key events
        if(agent.id==='commit')  sendNotification('pr_ready',{message:`PR checklist ready: ${requirement.slice(0,60)}`,session:sessions.length+1}).catch(()=>{});
        if(agent.id==='webdocs') sendNotification('docs_updated',{message:`Docs generated: ${requirement.slice(0,60)}`,session:sessions.length+1}).catch(()=>{});
        if(agent.id==='devops')  sendNotification('deploy_ready',{message:`CI/CD generated: ${requirement.slice(0,60)}`,session:sessions.length+1}).catch(()=>{});
      }catch(e){
        updateAgent(agent.id,{status:'error',output:e.message,progress:0});
        addMsg(agent.id,'warning',`Failed: ${e.message}`);
        sendNotification('agent_error',{message:`${agent.name} failed: ${e.message}`}).catch(()=>{});
      }
    }));

    // Phase 3 — Synthesis
    setScrumSynthPhase('active');
    addMsg('scrum','status','Synthesizing all outputs...');
    try{
      const allOut=workerAgents.map(a=>`=== ${a.name.toUpperCase()} ===\n${agentStatesRef.current[a.id]?.output||'(no output)'}`).join('\n\n');
      let synth='';
      await streamAgent({model:routing.scrum||'claude-sonnet-4-20250514',system:scrumAgent.synthPrompt,messages:[{role:'user',content:`Requirement:\n${requirement}\n\nAGENT OUTPUTS:\n${allOut.slice(0,6000)}`}],agentId:'scrum-synth',sessionId:sessionId.current,onChunk:chunk=>{synth+=chunk;setScrumSynth(synth);}});
      addMsg('scrum','complete',`Synthesis complete — ${synth.split(' ').length}w covering all ${workerAgents.length} agents`);
    }catch(e){setScrumSynth(`⚠ ${e.message}`);addMsg('scrum','warning',e.message);}
    setScrumSynthPhase('done');

    addMsg('system','system',`Session complete · $${sessionSpentRef.current.toFixed(5)}`);
    sendNotification('session_complete',{message:`Session complete: ${requirement.slice(0,60)}`,cost:sessionSpentRef.current,session:sessions.length+1}).catch(()=>{});
    setSessions(p=>[...p,{requirement,totalCost:sessionSpentRef.current,agentCosts:sessionAgentCosts,ts:Date.now()}]);
    setIsRunning(false);
  },[requirement,isRunning,routing,budgetSettings,agentConfigs,skills,workerAgents,scrumAgent,updateAgent,addCost,addMsg,sessions.length]);

  if(!user) return <Login onLogin={u=>{setUser(u);}}/>;

  const doneCount=workerAgents.filter(a=>agentStates[a.id]?.status==='done').length;
  const totalProg=isRunning?Math.round(workerAgents.reduce((s,a)=>s+(agentStates[a.id]?.progress||0),0)/workerAgents.length):doneCount>0?100:0;
  const hasRun=scrumPlanPhase!==null;
  const conflicts=messages.filter(m=>m.type==='conflict'||m.type==='warning').length;
  const modalAgent=modal?AGENT_DEFS.find(a=>a.id===modal):null;
  const modalState=modal?agentStates[modal]:null;

  return(
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-left">
            <div className="logo">⬡</div>
            <div><div className="nav-title">AGENT<span>POOL</span></div><div className="nav-sub">13 Agents · Smart Router · Live Chat</div></div>
          </div>
          <div className="nav-tabs">
            {[['run','▶ Run'],['skills','◆ Skills'],['config','⚙ Config']].map(([id,label])=>(
              <button key={id} className={`ntab ${page===id?'active':''}`} onClick={()=>setPage(id)}>{label}</button>
            ))}
          </div>
          <div className="nav-right">
            <div className="stat"><div className="sv" style={{color:'#00ff88'}}>{doneCount}</div><div className="sl">Done</div></div>
            {conflicts>0&&<div className="stat"><div className="sv" style={{color:'#ff4560'}}>{conflicts}</div><div className="sl">Flags</div></div>}
            <div className="stat"><div className="sv" style={{color:'#00d4ff'}}>${sessionSpent.toFixed(4)}</div><div className="sl">Spent</div></div>
            <div className="nav-user">
              <span>{user.username}</span>
              <span className="nav-role">{user.role}</span>
              <button className="logout-btn" onClick={()=>{logout();setUser(null);}}>↩</button>
            </div>
          </div>
        </nav>

        {page==='skills'?<SkillsTab skills={skills} setSkills={setSkills} agentConfigs={agentConfigs} setAgentConfigs={setAgentConfigs}/>
        :page==='config'?<ConfigTab configs={agentConfigs} setConfigs={setAgentConfigs} skills={skills} routing={routing} setRouting={setRouting} budgetSettings={budgetSettings} setBudgetSettings={setBudgetSettings} user={user}/>
        :(
          <>
            <div className="input-section">
              <div className="input-row">
                <textarea className="req-ta" placeholder="Technical requirement... (Ctrl+Enter to deploy all 13 agents)" value={requirement} onChange={e=>setRequirement(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))runAll();}}/>
                <div className="input-actions">
                  <button className={`run-btn ${isRunning?'running':''}`} onClick={runAll} disabled={isRunning||!requirement.trim()}>
                    {isRunning?`◌ ${doneCount}/${workerAgents.length}`:'▶ Deploy 13'}
                  </button>
                  <div className="quick-info">
                    <div className="qi-row"><span style={{color:'#00ffcc'}}>✦</span> {skills.filter(s=>s.global).length} global skills</div>
                    <div className="qi-row"><span style={{color:'#ff9500'}}>$</span> Cap: ${budgetSettings.sessionBudget}</div>
                  </div>
                </div>
              </div>
              <div className="examples">
                {['Real-time chat with E2E encryption','Multi-tenant SaaS billing','SENTINEL-AI edge analytics API','Distributed secrets manager'].map(ex=>(
                  <button key={ex} className="ex-chip" onClick={()=>setRequirement(ex)}>{ex}</button>
                ))}
              </div>
            </div>

            <div className="split-screen">
              <div className="split-chat" style={{width:`${chatSplit}%`}}>
                <ChatPanel messages={messages} agents={AGENT_DEFS} onSend={handleUserMessage} isRunning={isRunning} pinnedIds={pinnedIds} onPin={handlePin} onReact={handleReact} filter={chatFilter} setFilter={setChatFilter}/>
              </div>
              <div className="split-handle" onMouseDown={e=>{
                const sx=e.clientX,ss=chatSplit;
                const move=ev=>setChatSplit(Math.max(25,Math.min(55,ss+((ev.clientX-sx)/window.innerWidth)*100)));
                const up=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
                window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
              }}><div className="sh-dots">⋮</div></div>
              <div className="split-agents" style={{width:`${100-chatSplit-0.5}%`}}>
                {!hasRun&&<div className="agents-empty"><div className="ae-icon">⬡</div><div className="ae-title">13 Agents Ready</div><div className="ae-sub">Deploy a requirement to start · api.safecitysentinel.com</div></div>}
                {hasRun&&(
                  <>
                    {scrumPlan&&(
                      <div className="scrum-strip" style={{'--sc':scrumPlanPhase==='done'?'#ffffff':'#ff9500'}}>
                        <div className="ss-hdr-row">
                          <span style={{color:'#fff',fontSize:13}}>⬡</span>
                          <span className="ss-name">Scrum Master <span className="ss-ph">— Sprint Plan</span></span>
                          {scrumPlanPhase==='active'&&<span className="live-sm">● PLANNING</span>}
                          {scrumPlanPhase==='done'&&<span className="done-sm">✓ READY</span>}
                        </div>
                        <div className="ss-preview">{scrumPlan.slice(0,200)}...</div>
                        <button className="ss-expand" onClick={()=>setModal('__scrum_plan')}>READ FULL ↗</button>
                      </div>
                    )}
                    <div className="agents-progress">
                      <div className="gp-bar" style={{flex:1}}><div className="gp-fill" style={{width:`${totalProg}%`}}/></div>
                      <span className="gp-ct">{doneCount}/{workerAgents.length}</span>
                    </div>
                    <div className="agent-grid">
                      {workerAgents.map(agent=>(
                        <AgentCard key={agent.id} agent={agent} status={agentStates[agent.id]?.status||'idle'} output={agentStates[agent.id]?.output||''} progress={agentStates[agent.id]?.progress||0} modelKey={agentStates[agent.id]?.model||routing[agent.id]} cost={agentStates[agent.id]?.cost||0} onExpand={setModal}/>
                      ))}
                    </div>
                    {scrumSynth&&(
                      <div className="scrum-strip synth" style={{'--sc':'#00ff88'}}>
                        <div className="ss-hdr-row">
                          <span style={{color:'#00ff88',fontSize:13}}>⬡</span>
                          <span className="ss-name">Scrum Master <span className="ss-ph">— Execution Plan</span></span>
                          {scrumSynthPhase==='active'&&<span className="live-sm" style={{color:'#00ff88'}}>● SYNTHESIZING</span>}
                          {scrumSynthPhase==='done'&&<span className="done-sm" style={{color:'#00ff88'}}>✓ COMPLETE</span>}
                        </div>
                        <div className="ss-preview">{scrumSynth.slice(0,200)}...</div>
                        <button className="ss-expand" onClick={()=>setModal('__scrum_synth')}>READ FULL ↗</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {modal&&(
        <div className="modal-ov" onClick={()=>setModal(null)}>
          <div className="modal" style={{'--ac':modal.startsWith('__')?(modal==='__scrum_plan'?'#ffffff':'#00ff88'):(modalAgent?.color||'#00d4ff')}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">
                {modal==='__scrum_plan'&&<><span style={{color:'#fff'}}>⬡</span> Sprint Plan</>}
                {modal==='__scrum_synth'&&<><span style={{color:'#00ff88'}}>⬡</span> Execution Plan</>}
                {!modal.startsWith('__')&&modalAgent&&<><span style={{color:modalAgent.color}}>{modalAgent.icon}</span>{modalAgent.name}</>}
              </div>
              <button className="modal-close" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="out" style={{fontSize:13}} dangerouslySetInnerHTML={{__html:md(modal==='__scrum_plan'?scrumPlan:modal==='__scrum_synth'?scrumSynth:(modalState?.output||''))}}/>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@400;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#07090c;--s1:#0c1117;--s2:#111820;--bd:#1a2530;--t:#b0c8d8;--td:#3a5060;--tb:#e0f0ff;--mono:'JetBrains Mono',monospace;--disp:'Syne',sans-serif}
html,body,#root{height:100%;overflow:hidden}
body{background:var(--bg);color:var(--t);font-family:var(--mono);font-size:13px;line-height:1.6}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,212,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.012) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0}
.app{position:relative;z-index:1;height:100vh;display:flex;flex-direction:column;overflow:hidden}
/* Nav */
.nav{display:flex;align-items:center;justify-content:space-between;padding:11px 20px;border-bottom:1px solid var(--bd);background:linear-gradient(180deg,rgba(0,212,255,.04),transparent);flex-shrink:0;gap:10px;flex-wrap:wrap}
.nav-left{display:flex;align-items:center;gap:10px}
.logo{width:32px;height:32px;border:1.5px solid #00d4ff;display:flex;align-items:center;justify-content:center;font-size:14px;color:#00d4ff;background:rgba(0,212,255,.05);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);animation:lp 3s ease-in-out infinite;flex-shrink:0}
@keyframes lp{0%,100%{box-shadow:0 0 0 0 rgba(0,212,255,.2)}50%{box-shadow:0 0 10px rgba(0,212,255,.1)}}
.nav-title{font-family:var(--disp);font-size:16px;font-weight:800;color:var(--tb);letter-spacing:-.5px}
.nav-title span{color:#00d4ff}
.nav-sub{font-size:9px;color:var(--td);letter-spacing:2px;text-transform:uppercase}
.nav-tabs{display:flex;gap:2px;background:var(--s1);border:1px solid var(--bd);padding:3px;border-radius:3px}
.ntab{background:transparent;border:none;color:var(--td);font-family:var(--mono);font-size:10px;padding:5px 13px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;border-radius:2px;transition:all .15s;white-space:nowrap}
.ntab:hover{color:var(--t);background:rgba(255,255,255,.03)}
.ntab.active{background:#00d4ff;color:var(--bg);font-weight:700}
.nav-right{display:flex;align-items:center;gap:14px;flex-shrink:0}
.stat{text-align:right}
.sv{font-family:var(--disp);font-size:14px;font-weight:700;color:var(--tb)}
.sl{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1.5px}
.nav-user{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--t);border-left:1px solid var(--bd);padding-left:14px}
.nav-role{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1px;border:1px solid var(--bd);padding:1px 5px}
.logout-btn{background:transparent;border:1px solid var(--bd);color:var(--td);font-size:11px;padding:3px 8px;cursor:pointer;transition:all .15s}
.logout-btn:hover{border-color:#ff4560;color:#ff4560}
/* Login */
.login-screen{height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
.login-box{background:var(--s1);border:1px solid var(--bd);border-top:2px solid #00d4ff;padding:40px;width:340px;display:flex;flex-direction:column;align-items:center;gap:6px}
.login-logo{font-size:32px;color:#00d4ff;margin-bottom:4px}
.login-title{font-family:var(--disp);font-size:22px;font-weight:800;color:var(--tb);letter-spacing:-.5px}
.login-title span{color:#00d4ff}
.login-sub{font-size:10px;color:var(--td);text-transform:uppercase;letter-spacing:2px;margin-bottom:10px}
.login-form{width:100%;display:flex;flex-direction:column;gap:12px}
.lf-field{display:flex;flex-direction:column;gap:4px}
.lf-label{font-size:9px;color:var(--td);text-transform:uppercase;letter-spacing:1.5px}
.lf-input{background:var(--bg);border:1px solid var(--bd);color:var(--tb);font-family:var(--mono);font-size:13px;padding:10px 12px;outline:none;transition:border-color .2s;width:100%}
.lf-input:focus{border-color:#00d4ff}
.lf-error{font-size:11px;color:#ff4560;padding:6px 10px;border:1px solid rgba(255,69,96,.3);background:rgba(255,69,96,.05)}
.lf-btn{background:transparent;border:1.5px solid #00d4ff;color:#00d4ff;font-family:var(--disp);font-weight:700;font-size:12px;padding:11px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;transition:all .2s;margin-top:4px}
.lf-btn:not(:disabled):hover{background:#00d4ff;color:var(--bg)}
.lf-btn:disabled{opacity:.35;cursor:not-allowed}
.login-footer{font-size:9px;color:var(--td);margin-top:8px}
/* Input */
.input-section{padding:12px 20px;border-bottom:1px solid var(--bd);background:var(--s1);flex-shrink:0}
.input-row{display:flex;gap:9px;align-items:flex-start}
.req-ta{flex:1;background:var(--bg);border:1px solid var(--bd);border-radius:3px;color:var(--tb);font-family:var(--mono);font-size:12px;padding:9px 11px;resize:none;min-height:56px;max-height:100px;outline:none;transition:border-color .2s;line-height:1.5}
.req-ta:focus{border-color:#00d4ff}
.req-ta::placeholder{color:var(--td)}
.input-actions{display:flex;flex-direction:column;gap:6px;flex-shrink:0}
.run-btn{background:transparent;border:1.5px solid #00d4ff;color:#00d4ff;font-family:var(--disp);font-weight:700;font-size:11px;padding:9px 18px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;transition:all .2s;white-space:nowrap}
.run-btn:not(:disabled):hover{background:#00d4ff;color:var(--bg)}
.run-btn:disabled{opacity:.35;cursor:not-allowed}
.run-btn.running{border-color:#00ff88;color:#00ff88;animation:rp 1s ease-in-out infinite}
@keyframes rp{0%,100%{opacity:1}50%{opacity:.6}}
.quick-info{font-size:9px;color:var(--td)}
.qi-row{display:flex;align-items:center;gap:4px;margin-top:1px}
.examples{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.ex-chip{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:9px;padding:2px 8px;cursor:pointer;border-radius:2px;transition:all .15s}
.ex-chip:hover{border-color:#00d4ff;color:#00d4ff}
/* Split */
.split-screen{display:flex;flex:1;overflow:hidden;min-height:0}
.split-chat{display:flex;flex-direction:column;border-right:1px solid var(--bd);overflow:hidden;flex-shrink:0}
.split-handle{width:5px;background:var(--bd);cursor:col-resize;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;user-select:none}
.split-handle:hover{background:#00d4ff}
.sh-dots{color:var(--td);font-size:14px;writing-mode:vertical-rl;letter-spacing:-2px;pointer-events:none}
.split-agents{display:flex;flex-direction:column;overflow-y:auto;flex:1;min-width:0;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
/* Chat */
.chat-panel{display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg)}
.chat-hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;border-bottom:1px solid var(--bd);background:var(--s1);flex-shrink:0}
.chat-title{font-family:var(--disp);font-size:12px;font-weight:700;color:var(--tb);display:flex;align-items:center;gap:7px}
.live-badge{font-size:9px;color:#00ff88;letter-spacing:1.5px;animation:fp 1s ease-in-out infinite}
@keyframes fp{0%,100%{opacity:1}50%{opacity:.3}}
.chat-pin-btn{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer;transition:all .15s}
.chat-pin-btn.active{border-color:#ffd700;color:#ffd700}
.chat-filters{display:flex;align-items:center;gap:2px;padding:5px 9px;border-bottom:1px solid var(--bd);overflow-x:auto;flex-shrink:0}
.chat-filters::-webkit-scrollbar{display:none}
.cf-btn{background:transparent;border:1px solid transparent;color:var(--td);font-family:var(--mono);font-size:9px;padding:2px 6px;cursor:pointer;border-radius:2px;transition:all .15s;white-space:nowrap}
.cf-btn:hover{color:var(--t);border-color:var(--bd)}
.cf-btn.active{background:rgba(0,212,255,.1);border-color:#00d4ff;color:#00d4ff}
.cf-div{width:1px;height:14px;background:var(--bd);margin:0 3px;flex-shrink:0}
.chat-messages{flex:1;overflow-y:auto;padding:7px;display:flex;flex-direction:column;gap:3px;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
.chat-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--td)}
.ce-icon{font-size:28px;opacity:.15;color:#00d4ff}
.cmsg{border-radius:3px;padding:6px 8px;border:1px solid transparent;position:relative}
.cmsg:hover .cmsg-actions{opacity:1}
.cmsg.pinned{border-color:rgba(255,215,0,.3);background:rgba(255,215,0,.03)!important}
.cmsg.system{padding:3px 0;text-align:center}
.cmsg-hdr{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.cmsg-avatar{width:24px;height:24px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:var(--disp);font-size:7px;font-weight:800;letter-spacing:.5px;flex-shrink:0}
.cmsg-meta{flex:1;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.cmsg-name{font-family:var(--disp);font-size:10px;font-weight:700}
.cmsg-to{font-size:9px;color:var(--td)}
.cmsg-type{font-size:7px;padding:1px 4px;border:1px solid;letter-spacing:1px;text-transform:uppercase}
.cmsg-ts{font-size:8px;color:var(--td);margin-left:auto}
.cmsg-actions{display:flex;gap:2px;opacity:0;transition:opacity .15s}
.cmsg-act{background:transparent;border:1px solid var(--bd);color:var(--td);font-size:9px;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;border-radius:2px;padding:0}
.cmsg-act:hover,.cmsg-act.active{border-color:#00d4ff;background:rgba(0,212,255,.1)}
.cmsg-body{font-size:10px;color:var(--t);line-height:1.6}
.cmsg-sys{font-size:9px;color:var(--td);letter-spacing:1px;text-transform:uppercase}
.expand-txt{background:transparent;border:none;color:#00d4ff;font-family:var(--mono);font-size:9px;cursor:pointer;padding:2px 0;letter-spacing:1px}
.cmsg-reaction{position:absolute;bottom:3px;right:7px;font-size:12px}
.mention-hint{margin:0 9px 5px;padding:5px 9px;border:1px solid;border-radius:3px;font-size:10px;color:var(--t);background:rgba(0,0,0,.3);display:flex;align-items:center;gap:6px}
.chat-input-row{padding:7px 9px;border-top:1px solid var(--bd);background:var(--s1);flex-shrink:0}
.chat-input-wrap{display:flex;gap:5px;align-items:flex-end}
.chat-input{flex:1;background:var(--bg);border:1px solid var(--bd);border-radius:3px;color:var(--tb);font-family:var(--mono);font-size:11px;padding:7px 9px;resize:none;outline:none;line-height:1.5;transition:border-color .2s}
.chat-input:focus{border-color:#00d4ff}
.chat-input::placeholder{color:var(--td)}
.chat-send{background:#00d4ff;border:none;color:var(--bg);width:30px;height:30px;cursor:pointer;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:2px;flex-shrink:0}
.chat-send:disabled{opacity:.3;cursor:not-allowed}
.chat-hint{font-size:8px;color:var(--td);margin-top:3px}
/* Agents */
.agents-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--td)}
.ae-icon{font-size:36px;opacity:.12;color:#00d4ff}
.ae-title{font-family:var(--disp);font-size:15px;font-weight:700;color:var(--tb);opacity:.35}
.ae-sub{font-size:10px;opacity:.3}
.scrum-strip{background:var(--s1);border-bottom:1px solid var(--bd);border-top:2px solid var(--sc);padding:9px 13px;flex-shrink:0}
.ss-hdr-row{display:flex;align-items:center;gap:7px;margin-bottom:3px}
.ss-name{font-family:var(--disp);font-size:11px;font-weight:700;color:var(--tb)}
.ss-ph{font-weight:400;color:var(--td);font-family:var(--mono);font-size:9px}
.live-sm{font-size:8px;color:#ff9500;letter-spacing:1.5px;margin-left:auto;animation:fp 1s ease-in-out infinite}
.done-sm{font-size:8px;color:#00d4ff;letter-spacing:1.5px;margin-left:auto}
.ss-preview{font-size:9px;color:var(--td);line-height:1.4;margin-bottom:5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ss-expand{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:8px;padding:2px 8px;cursor:pointer;transition:all .15s}
.ss-expand:hover{border-color:#00d4ff;color:#00d4ff}
.agents-progress{display:flex;align-items:center;gap:10px;padding:5px 13px;border-bottom:1px solid var(--bd);flex-shrink:0}
.gp-bar{height:2px;background:var(--bd);overflow:hidden}
.gp-fill{height:100%;background:linear-gradient(90deg,#00d4ff,#00ff88);transition:width .3s}
.gp-ct{font-size:9px;color:var(--td);white-space:nowrap}
.agent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--bd)}
@media(max-width:1200px){.agent-grid{grid-template-columns:repeat(2,1fr)}}
.acard{background:var(--s1);display:flex;flex-direction:column;min-height:200px;max-height:320px;overflow:hidden;position:relative}
.acard::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac);opacity:0;transition:opacity .3s}
.acard.streaming::before,.acard.done::before{opacity:1}
.acard.done{background:color-mix(in srgb,var(--s1) 94%,var(--ac))}
.acard-bar{height:2px;background:var(--bd);flex-shrink:0;overflow:hidden}
.acard-fill{height:100%;transition:width .3s}
.acard-hdr{display:flex;align-items:center;gap:7px;padding:8px 10px 7px;border-bottom:1px solid var(--bd);flex-shrink:0}
.acard-meta{flex:1;min-width:0}
.acard-name{font-family:var(--disp);font-weight:700;font-size:10px;color:var(--tb)}
.acard-lbl{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:.5px}
.acard-right{display:flex;align-items:center;gap:4px;flex-shrink:0}
.model-tag{font-size:7px;letter-spacing:1px;text-transform:uppercase;padding:1px 4px;border:1px solid}
.cost-tag{font-size:8px;color:#ff9500}
.sdot{width:6px;height:6px;border-radius:50%;background:var(--bd);flex-shrink:0}
.sdot.streaming{background:#00ff88;box-shadow:0 0 5px #00ff88;animation:db .8s ease-in-out infinite}
.sdot.done{background:var(--ac)}
.sdot.error{background:#ff4560}
.sdot.waiting{background:#1e3040;animation:db 1.2s ease-in-out infinite}
@keyframes db{0%,100%{opacity:1}50%{opacity:.2}}
.acard-body{flex:1;overflow-y:auto;padding:8px 10px;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
.ph{display:flex;align-items:center;gap:7px;color:var(--td);font-size:10px;height:100%}
.ph.pulse{animation:pp 1.5s ease-in-out infinite}
@keyframes pp{0%,100%{opacity:.4}50%{opacity:1}}
.acard-foot{padding:4px 10px;border-top:1px solid var(--bd);font-size:8px;color:var(--td);display:flex;align-items:center;gap:5px;flex-shrink:0}
.expand-btn{margin-left:auto;background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:7px;padding:2px 5px;cursor:pointer;transition:all .15s}
.expand-btn:hover{border-color:var(--ac);color:var(--ac)}
.out{font-size:11px;line-height:1.7;color:var(--t)}
.out h1,.out h2,.out h3{font-family:var(--disp);color:var(--ac,#00d4ff);margin:10px 0 3px;text-transform:uppercase;letter-spacing:1px}
.out h1{font-size:11px;margin-top:0}.out h2{font-size:10px}.out h3{font-size:9px;opacity:.75}
.out p{margin:4px 0}.out strong{color:var(--tb)}
.out li{margin:2px 0 2px 11px;list-style:none;position:relative}
.out li::before{content:'▸';position:absolute;left:-10px;color:var(--ac,#00d4ff);font-size:8px}
.out .n::before{content:'·'}
.cb{background:var(--bg);border:1px solid var(--bd);border-left:2px solid var(--ac,#00d4ff);padding:7px 9px;margin:6px 0;overflow-x:auto;font-size:9px;line-height:1.5}
.cb code{color:#7dd3a8;font-family:var(--mono)}
.ic{background:var(--bg);border:1px solid var(--bd);border-radius:2px;padding:0 3px;font-size:9px;color:var(--ac,#00d4ff)}
.out-err{color:#ff4560;font-size:10px;display:flex;gap:5px;padding:7px;border:1px solid rgba(255,69,96,.2)}
/* Skills */
.skills-page,.settings-page{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px}
.skills-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.sk-title{font-family:var(--disp);font-size:17px;font-weight:800;color:var(--tb)}
.sk-sub{font-size:9px;color:var(--td);margin-top:2px}
.sk-new-btn{background:transparent;border:1.5px solid #00ffcc;color:#00ffcc;font-family:var(--disp);font-weight:700;font-size:10px;padding:7px 14px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;transition:all .2s;white-space:nowrap;flex-shrink:0}
.sk-new-btn:hover{background:#00ffcc;color:var(--bg)}
.skill-form{background:var(--s1);border:1px solid #00ffcc;border-left:2px solid #00ffcc;padding:16px}
.sf-title{font-family:var(--disp);font-size:12px;font-weight:700;color:var(--tb);margin-bottom:12px}
.sf-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px}
@media(max-width:700px){.sf-grid{grid-template-columns:repeat(2,1fr)}}
.sf-field{display:flex;flex-direction:column;gap:3px}
.sf-input{background:var(--bg);border:1px solid var(--bd);color:var(--tb);font-family:var(--mono);font-size:11px;padding:5px 7px;outline:none;width:100%}
.sf-input:focus{border-color:#00ffcc}
.sf-textarea{width:100%;background:var(--bg);border:1px solid var(--bd);color:var(--tb);font-family:var(--mono);font-size:11px;padding:7px;outline:none;resize:vertical;line-height:1.6}
.sf-textarea:focus{border-color:#00ffcc}
.sf-actions{display:flex;gap:7px;margin-top:12px}
.sf-save{background:#00ffcc;border:none;color:var(--bg);font-family:var(--disp);font-weight:700;font-size:11px;padding:7px 16px;cursor:pointer}
.sf-cancel{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:11px;padding:7px 12px;cursor:pointer}
.sf-cancel:hover{border-color:#ff4560;color:#ff4560}
.skill-category{display:flex;flex-direction:column;gap:7px}
.scat-label{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:2px;padding-bottom:4px;border-bottom:1px solid var(--bd)}
.skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:7px}
.skill-card{background:var(--s1);border:1px solid var(--bd);padding:12px;position:relative}
.skill-card::before{content:'';position:absolute;top:0;left:0;bottom:0;width:2px;background:var(--skc);opacity:.5}
.skill-card.global{border-color:rgba(0,255,204,.2)}
.skill-card.global::before{opacity:1}
.sk-card-hdr{display:flex;align-items:flex-start;gap:7px;margin-bottom:6px}
.sk-card-icon{font-size:16px;flex-shrink:0}
.sk-card-name{font-family:var(--disp);font-size:11px;font-weight:700;color:var(--tb)}
.sk-card-desc{font-size:8px;color:var(--td)}
.sk-global{font-size:7px;color:#00ffcc;border:1px solid rgba(0,255,204,.4);padding:1px 4px;letter-spacing:1px;margin-left:auto;flex-shrink:0}
.sk-card-preview{font-size:8px;color:var(--td);line-height:1.4;margin-bottom:7px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.sk-card-actions{display:flex;gap:3px;flex-wrap:wrap}
.sk-act{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:8px;padding:2px 7px;cursor:pointer;transition:all .15s}
.sk-act:hover{border-color:var(--skc);color:var(--skc)}
.sk-act-on{border-color:#00ffcc!important;color:#00ffcc!important}
.sk-assign:hover{border-color:#e040fb;color:#e040fb}
.sk-del:hover{border-color:#ff4560;color:#ff4560}
.sk-assign-panel{margin-top:8px;padding-top:8px;border-top:1px solid var(--bd)}
.sk-assign-title{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.sk-assign-agents{display:flex;flex-wrap:wrap;gap:3px}
.sk-agent-btn{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:8px;padding:2px 7px;cursor:pointer;border-radius:2px;transition:all .15s;display:flex;align-items:center;gap:3px}
/* Settings */
.settings-section{background:var(--s1);border:1px solid var(--bd);padding:16px}
.ss-title{font-family:var(--disp);font-size:13px;font-weight:700;color:var(--tb);margin-bottom:10px}
.settings-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@media(max-width:680px){.settings-grid{grid-template-columns:1fr}}
.sg-field{display:flex;flex-direction:column;gap:3px}
.sg-toggle-field{flex-direction:row;align-items:center;justify-content:space-between;gap:12px;background:var(--bg);border:1px solid var(--bd);padding:8px 10px}
.sg-label{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1.5px}
.sg-hint{font-size:9px;color:var(--td)}
.sg-input-row{display:flex;align-items:center;background:var(--bg);border:1px solid var(--bd)}
.sg-prefix{padding:7px 8px;color:var(--td);font-size:11px;border-right:1px solid var(--bd)}
.sg-input{background:var(--bg);border:1px solid var(--bd);color:var(--tb);font-family:var(--mono);font-size:11px;padding:6px 8px;outline:none;width:100%}
.sg-input:focus{border-color:var(--ac,#00d4ff)}
.sg-textarea{width:100%;background:var(--bg);border:1px solid var(--bd);color:var(--tb);font-family:var(--mono);font-size:11px;padding:6px 8px;outline:none;resize:vertical;line-height:1.6}
.toggle{width:36px;height:18px;background:var(--bd);border-radius:9px;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
.toggle.on{background:var(--tc,#00d4ff)}
.tknob{position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on .tknob{transform:translateX(18px)}
.routing-config{display:flex;flex-direction:column;gap:1px;margin-bottom:10px}
.rc-row{display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg);border-bottom:1px solid var(--bd)}
.rc-meta{width:130px;flex-shrink:0}
.rc-name{font-size:10px;color:var(--tb);font-family:var(--disp);font-weight:700}
.rc-lbl{font-size:8px;color:var(--td);text-transform:uppercase}
.rc-select{flex:1;background:var(--s1);border:1px solid var(--bd);color:var(--t);font-family:var(--mono);font-size:9px;padding:4px 6px;outline:none;cursor:pointer}
.rc-cost{width:50px;text-align:right;font-size:9px;flex-shrink:0}
.reset-btn{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:9px;padding:5px 11px;cursor:pointer;transition:all .15s}
.reset-btn:hover{border-color:#00d4ff;color:#00d4ff}
.agent-cfg-list{display:flex;flex-direction:column;gap:1px}
.acfg-card{background:var(--bg);border:1px solid var(--bd);overflow:hidden;transition:border-color .2s}
.acfg-card.open{border-color:var(--ac)}
.acfg-row{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;transition:background .15s}
.acfg-row:hover{background:rgba(255,255,255,.012)}
.acfg-name{font-family:var(--disp);font-size:11px;font-weight:700;color:var(--tb)}
.acfg-lbl{font-size:8px;color:var(--td);text-transform:uppercase}
.acfg-tags{display:flex;gap:3px;flex-wrap:wrap}
.cfg-tag{font-size:7px;padding:1px 5px;border:1px solid var(--bd);color:var(--td);text-transform:uppercase;letter-spacing:1px}
.acfg-chev{color:var(--td);font-size:10px;margin-left:5px}
.acfg-panel{padding:0 12px 12px;border-top:1px solid var(--bd);display:flex;flex-direction:column;gap:7px}
.acfg-field{display:flex;flex-direction:column;gap:3px;margin-top:7px}
.active-skills{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}
.active-skill-chip{font-size:8px;padding:1px 6px;border:1px solid}
.fetch-btn{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:8px;padding:6px 9px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;transition:all .15s;white-space:nowrap;flex-shrink:0}
.fetch-btn:not(:disabled):hover{border-color:#00d4ff;color:#00d4ff}
.fetch-btn:disabled{opacity:.3;cursor:not-allowed}
.fetch-msg{font-size:9px;color:var(--td);padding:3px 6px;background:var(--s1);border:1px solid var(--bd)}
.team-form{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:4px}
.team-form .sg-input{width:auto;flex:1;min-width:100px}
/* Modal */
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.modal{background:var(--s1);border:1px solid var(--bd);border-top:2px solid var(--ac);width:100%;max-width:800px;max-height:88vh;display:flex;flex-direction:column}
.modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--bd);flex-shrink:0;gap:8px}
.modal-title{font-family:var(--disp);font-size:13px;font-weight:700;color:var(--tb);display:flex;align-items:center;gap:7px}
.modal-close{background:transparent;border:1px solid var(--bd);color:var(--td);font-size:12px;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.modal-close:hover{border-color:#ff4560;color:#ff4560}
.modal-body{flex:1;overflow-y:auto;padding:16px;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
`;
