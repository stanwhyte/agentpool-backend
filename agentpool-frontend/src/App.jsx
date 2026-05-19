import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Login from './Login.jsx'
import SkillsTab from './SkillsTab.jsx'
import ConfigTab from './ConfigTab.jsx'
import { isLoggedIn, getUser, logout, streamAgent, sendNotification, loadSkills, saveSkills, loadSettings, saveSettings, saveSession, loadMemory, saveMemoryEntries } from './api.js'
import SessionsTab  from './SessionsTab.jsx'
import MemoryTab      from './MemoryTab.jsx'
import ExecutorPanel  from './ExecutorPanel.jsx'
import ApprovalGate   from './ApprovalGate.jsx'
import LocalLLMConfig from './LocalLLMConfig.jsx'

const MODELS = {
  'claude-sonnet-4-20250514':  { label: 'Claude Sonnet 4', costIn: 3.00,  costOut: 15.00, free: false },
  'claude-haiku-4-5-20251001': { label: 'Claude Haiku 4',  costIn: 0.80,  costOut: 4.00,  free: false },
  'gpt-4o':                    { label: 'GPT-4o',          costIn: 2.50,  costOut: 10.00, free: false },
  'gpt-4o-mini':               { label: 'GPT-4o Mini',     costIn: 0.15,  costOut: 0.60,  free: false },
  'gemini-2.0-flash':          { label: 'Gemini Flash',    costIn: 0.075, costOut: 0.30,  free: true  },
  'llama-3.3-70b-versatile':   { label: 'Groq Llama 3.3',  costIn: 0.00,  costOut: 0.00,  free: true  },
  'sonar-pro':                 { label: 'Perplexity Sonar', costIn: 3.00,  costOut: 15.00, free: false },
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

const DOWNGRADE = {
  'claude-sonnet-4-20250514': 'claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001': 'llama-3.3-70b-versatile',
  'gpt-4o': 'gpt-4o-mini', 'gpt-4o-mini': 'llama-3.3-70b-versatile',
  'gemini-2.0-flash': 'llama-3.3-70b-versatile',
  'sonar-pro': 'llama-3.3-70b-versatile',
  'llama-3.3-70b-versatile': 'llama-3.3-70b-versatile',
}

const AGENTS = [
  { id: 'scrum', name: 'Scrum Master', label: 'Orchestrator', icon: '⬡', color: '#ffffff', avatar: 'SM', isOrchestrator: true,
    systemPrompt: 'You are a Senior Scrum Master. Given a technical requirement produce:\n1. EPIC SUMMARY\n2. USER STORIES: 4-6 stories\n3. SPRINT BACKLOG: With story points (1/2/3/5/8)\n4. DEPENDENCY MAP\n5. RISK FLAGS\n6. DEFINITION OF DONE',
    synthPrompt:  'You are a Senior Scrum Master reviewing all agent outputs. Produce:\n1. EXECUTION PLAN\n2. CONTRADICTIONS\n3. CRITICAL PATH: Top 5 steps\n4. OPEN QUESTIONS\n5. SPRINT PLAN: 2-week breakdown\n6. SIGN-OFF CHECKLIST' },
  { id: 'architect',   name: 'Architect',           label: 'Tech Design',          icon: '◈', color: '#00d4ff', avatar: 'AR',
    systemPrompt: 'You are a Senior Software Architect. Produce:\n1. ARCHITECTURE OVERVIEW\n2. TECH STACK with justification\n3. DATA MODELS\n4. API CONTRACT\n5. SCALABILITY NOTES' },
  { id: 'codegen',     name: 'CodeGen',              label: 'Code Generation',      icon: '⌥', color: '#00ff88', avatar: 'CG',
    systemPrompt: 'You are an elite software engineer. Produce:\n1. IMPLEMENTATION PLAN\n2. CORE CODE with comments\n3. FILE STRUCTURE\n4. KEY ALGORITHMS\n5. DEPENDENCIES with versions' },
  { id: 'research',    name: 'Research',             label: 'Docs & Research',      icon: '◎', color: '#ff9500', avatar: 'RE',
    systemPrompt: 'You are a Technical Research Specialist. Produce:\n1. PRIOR ART\n2. BEST PRACTICES\n3. SECURITY CONSIDERATIONS\n4. PERFORMANCE BENCHMARKS\n5. REFERENCES' },
  { id: 'reviewer',    name: 'Reviewer',             label: 'Code Review',          icon: '⊛', color: '#ff4560', avatar: 'RV',
    systemPrompt: 'You are a Senior Code Reviewer. Produce:\n1. RISK ASSESSMENT with severity\n2. CODE REVIEW CHECKLIST\n3. SECURITY CONTROLS\n4. COMMON PITFALLS\n5. COMPLIANCE NOTES: GDPR, OWASP' },
  { id: 'tester',      name: 'Tester',               label: 'Test Generation',      icon: '⊡', color: '#b060ff', avatar: 'TE',
    systemPrompt: 'You are a QA Engineer. Produce:\n1. TEST STRATEGY\n2. TEST CASES: 8-10 scenarios\n3. EDGE CASES\n4. TEST CODE: Jest/Vitest\n5. COVERAGE GOALS' },
  { id: 'docs',        name: 'Docs',                 label: 'Documentation',        icon: '❋', color: '#ffd700', avatar: 'DO',
    systemPrompt: 'You are a Technical Writer. Produce:\n1. README DRAFT\n2. API DOCUMENTATION\n3. ARCHITECTURE DIAGRAM (ASCII)\n4. DEVELOPER GUIDE\n5. CHANGELOG TEMPLATE' },
  { id: 'cybersec',    name: 'CyberSec',             label: 'Threat Modeling',      icon: '☠', color: '#ff6b35', avatar: 'CS',
    systemPrompt: 'You are a Senior Cybersecurity Analyst. Produce:\n1. THREAT MODEL (STRIDE)\n2. ATTACK SURFACE\n3. OWASP TOP 10\n4. PENTEST SCENARIOS: 5 specific\n5. MITIGATIONS\n6. INCIDENT RESPONSE' },
  { id: 'crypto',      name: 'Crypto & Compliance',  label: 'Cryptography · SOC 2', icon: '⚷', color: '#e040fb', avatar: 'CC',
    systemPrompt: 'You are a Cryptography Engineer. Produce:\n1. CRYPTO DESIGN\n2. KEY MANAGEMENT\n3. DATA ENCRYPTION\n4. SOC 2 MAPPING\n5. COMPLIANCE CONTROLS\n6. AUDIT EVIDENCE' },
  { id: 'commit',      name: 'Commit Control',       label: 'PR & Release Gate',    icon: '⎇', color: '#40c4ff', avatar: 'CM',
    systemPrompt: 'You are a Senior Git Workflow Engineer. Produce:\n1. BRANCH STRATEGY\n2. COMMIT STANDARDS\n3. PR CHECKLIST\n4. CHANGE IMPACT\n5. RELEASE NOTES\n6. ROLLBACK PLAN' },
  { id: 'devops',      name: 'DevOps Engineer',      label: 'CI/CD · Docker · IaC', icon: '⚙', color: '#00e5ff', avatar: 'DV',
    systemPrompt: 'You are a Senior DevOps Engineer. Produce:\n1. GITHUB ACTIONS YAML\n2. DOCKERFILE\n3. DOCKER COMPOSE\n4. TERRAFORM for DigitalOcean\n5. ENV TEMPLATE\n6. HEALTH CHECKS\n7. ROLLBACK' },
  { id: 'webdocs',     name: 'Web & Docs',           label: 'Website · API · SEO',  icon: '◉', color: '#69ff47', avatar: 'WD',
    systemPrompt: 'You are a Web Publisher. Produce:\n1. LANDING PAGE COPY\n2. OPENAPI SPEC 3.0\n3. MINTLIFY CONFIG\n4. DOCS PIPELINE\n5. SEO METADATA\n6. QUICKSTART\n7. CHANGELOG ENTRY' },
  { id: 'dataeng',     name: 'Data Engineer',        label: 'Schema · Migrations',  icon: '⊞', color: '#ff9e80', avatar: 'DE',
    systemPrompt: 'You are a Senior Data Engineer. Produce:\n1. SQL SCHEMA\n2. MIGRATIONS up/down\n3. SEED DATA\n4. QUERY OPTIMIZATION\n5. DATA RETENTION\n6. GDPR\n7. BACKUP STRATEGY' },
  { id: 'performance', name: 'Performance Engineer', label: 'Load · Profiling · k6', icon: '⚡', color: '#ffeb3b', avatar: 'PE',
    systemPrompt: 'You are a Senior Performance Engineer. Produce:\n1. PERFORMANCE REQUIREMENTS: Latency targets, throughput goals, SLAs\n2. LOAD TEST PLAN: k6 script for key endpoints\n3. PROFILING STRATEGY: CPU, memory, DB query analysis\n4. BOTTLENECK ANALYSIS: Predicted hotspots\n5. CACHING STRATEGY: What to cache, TTL, invalidation\n6. SCALING PLAN: Horizontal vs vertical, thresholds\n7. BENCHMARKS: Baseline numbers to hit before launch' },
]

const SENTINEL_VAULT_SKILL = {
  id: 'sentinel-vault', name: 'Sentinel Vault', icon: '⚷', color: '#00ffcc',
  category: 'tech', builtin: true, global: true,
  description: 'Secrets manager — ratchet, open-core, DO, licensing',
  content: `PROJECT: SENTINEL VAULT — Secrets Management System

ARCHITECTURE:
- HashiCorp Vault alternative, self-hostable
- Cryptographic ratchet for forward secrecy (Double Ratchet inspired)
- Each secret access rotates the chain key — compromise of current state doesn't expose past secrets
- Kubernetes JWT workload authentication (no static credentials)
- PostgreSQL backend for secret storage and audit log
- Redis for session caching and rate limiting
- Go implementation (Fiber, pgxpool, go-redis)
- Target: 50M API calls/day at scale

MVP SCOPE (what's in):
- Secret CRUD with versioning
- Ratchet key rotation on every read
- JWT workload auth (Kubernetes service account tokens)
- PostgreSQL persistence with full audit trail
- Redis caching layer
- REST API with OpenAPI spec
- CLI client

MVP SCOPE (explicitly excluded):
- Web UI (post-MVP)
- SPIFFE/SPIRE integration (post-MVP)
- External provider sync (AWS Secrets Manager, Vault — post-MVP)
- Terraform provider (post-MVP)

LICENSING MODEL (open-core):
- Core engine: MIT or Apache 2.0 — self-hostable, free forever
- Enterprise tier: paid — SSO, audit export, SLA, multi-region replication
- Cloud tier: hosted SaaS on DigitalOcean — per-seat or per-secret pricing
- No open-core bait-and-switch: core crypto and ratchet always open

VERSIONING:
- Every secret has immutable version history
- Read returns current version by default
- Callers can pin to specific version
- Soft-delete only — versions never physically removed
- Retention policy configurable per secret

INFRASTRUCTURE (DigitalOcean):
- API: DO Droplets (Go binary, systemd)
- DB: DO Managed PostgreSQL with PgBouncer
- Cache: DO Managed Redis
- Secrets bootstrap: env file at /etc/sentinel-vault/.env (chmod 600)
- Region: fra1
- Backup: DO automated + WAL archiving

SECURITY BASELINE:
- AES-256-GCM for secret encryption at rest
- ChaCha20-Poly1305 as alternative cipher
- Master key stored separately from data key
- Key rotation: 90-day schedule, zero-downtime
- All access logged: who, what, when, from where (SOC 2 CC6)
- Rate limiting per workload identity.sessions-page{flex:1;overflow:hidden;display:flex;flex-direction:column}
.sessions-layout{display:flex;flex:1;overflow:hidden}
.sessions-list{width:320px;flex-shrink:0;border-right:1px solid var(--bd);display:flex;flex-direction:column;overflow:hidden}
.sessions-list-hdr{padding:16px;border-bottom:1px solid var(--bd);flex-shrink:0}
.sess-loading{padding:16px;color:var(--td);font-size:11px}
.sess-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:40px;color:var(--td);font-size:11px;text-align:center}
.sess-item{padding:10px 14px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .15s}
.sess-item:hover{background:rgba(255,255,255,.02)}
.sess-item.active{background:rgba(0,212,255,.05);border-left:2px solid #00d4ff}
.sess-item-req{font-size:10px;color:var(--tb);margin-bottom:5px;line-height:1.4}
.sess-item-meta{display:flex;align-items:center;gap:8px;font-size:8px}
.sess-del{background:transparent;border:none;color:var(--td);cursor:pointer;margin-left:auto;font-size:10px;padding:1px 4px}
.sess-del:hover{color:#ff4560}
.sessions-detail{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
.sess-detail-content{padding:16px;display:flex;flex-direction:column;gap:16px}
.sess-detail-hdr{border-bottom:1px solid var(--bd);padding-bottom:12px}
.sess-detail-req{font-family:var(--disp);font-size:13px;font-weight:700;color:var(--tb);margin-bottom:6px}
.sess-detail-meta{display:flex;gap:10px;font-size:9px}
.sess-section{display:flex;flex-direction:column;gap:8px}
.sess-section-title{font-family:var(--disp);font-size:10px;font-weight:700;color:var(--tb);text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px}
.sess-agents{display:flex;flex-direction:column;gap:4px}
.so-agent{border:1px solid var(--bd);overflow:hidden}
.so-agent-hdr{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;background:var(--s1);transition:background .15s}
.so-agent-hdr:hover{background:rgba(255,255,255,.02)}
.so-agent-name{font-family:var(--disp);font-size:10px;font-weight:700;color:var(--tb);flex:1}
.so-agent-words{font-size:8px;color:var(--td)}
.so-chev{font-size:9px;color:var(--td);margin-left:4px}
.so-agent-body{padding:10px;border-top:1px solid var(--bd);background:var(--bg);max-height:400px;overflow-y:auto}
.memory-page{flex:1;overflow:hidden;display:flex;flex-direction:column}
.memory-layout{display:flex;flex:1;overflow:hidden}
.memory-sidebar{width:240px;flex-shrink:0;border-right:1px solid var(--bd);display:flex;flex-direction:column;overflow-y:auto}
.memory-sidebar-hdr{padding:16px;border-bottom:1px solid var(--bd);flex-shrink:0}
.mem-agent-row{display:flex;align-items:center;gap:8px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--bd);transition:background .15s}
.mem-agent-row:hover{background:rgba(255,255,255,.02)}
.mem-agent-row.active{background:rgba(0,212,255,.05);border-left:2px solid var(--ac,#00d4ff)}
.mem-agent-meta{flex:1}
.mem-agent-name{font-family:var(--disp);font-size:10px;font-weight:700;color:var(--tb)}
.mem-agent-count{font-size:8px;color:var(--td)}
.mem-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
.memory-detail{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
.memory-detail-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--bd);flex-shrink:0}
.mem-add-form{padding:12px 16px;border-bottom:1px solid var(--bd);background:var(--s1)}
.mem-entries{padding:10px;display:flex;flex-direction:column;gap:6px}
.mem-entry{border:1px solid var(--bd);border-left:2px solid var(--mc,#00d4ff);padding:8px 10px}
.mem-entry-hdr{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.mem-entry-type{font-size:7px;padding:1px 5px;border:1px solid;text-transform:uppercase;letter-spacing:1px}
.mem-entry-ts{font-size:8px;color:var(--td)}
.mem-entry-session{font-size:7px;color:var(--td);border:1px solid var(--bd);padding:0 4px}
.mem-del{background:transparent;border:none;color:var(--td);cursor:pointer;font-size:9px;margin-left:auto;padding:1px 4px}
.mem-del:hover{color:#ff4560}
.mem-entry-content{font-size:10px;color:var(--t);line-height:1.6;white-space:pre-wrap}
.mem-tags{display:flex;gap:3px;flex-wrap:wrap;margin-top:5px}
.mem-tag{font-size:7px;padding:1px 5px;border:1px solid var(--bd);color:var(--td)}
.llm-config{background:var(--s1);border:1px solid var(--bd);border-left:2px solid #00ffcc;padding:16px;margin-bottom:16px}
.llm-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:0}
.llm-title{font-family:var(--disp);font-size:13px;font-weight:700;color:#00ffcc;flex:0 0 auto}
.llm-sub{font-size:9px;color:var(--td);flex:1;margin-top:2px}
.llm-section{margin-top:14px;padding-top:14px;border-top:1px solid var(--bd)}
.llm-sect-title{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
.llm-presets{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}
.llm-preset{background:var(--bg);border:1px solid var(--bd);color:var(--t);padding:6px 8px;cursor:pointer;text-align:left;transition:all .15s}
.llm-preset:hover{border-color:#00ffcc}
.llm-preset.active{border-color:#00ffcc;background:rgba(0,255,204,.06)}
.llm-preset-label{font-family:var(--disp);font-size:10px;font-weight:700;color:var(--tb)}
.llm-preset-note{font-size:8px;color:var(--td)}
.llm-test-result{font-size:10px;margin-top:6px;padding:4px 8px;border:1px solid;border-radius:2px}
.llm-models{display:flex;flex-direction:column;gap:3px}
.llm-model{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:var(--bg);border:1px solid var(--bd)}
.llm-model-name{font-size:10px;color:var(--tb);font-family:var(--disp);font-weight:700}
.llm-model-note{font-size:8px;color:var(--td)}
.llm-model-id{font-size:8px;color:#00ffcc;border:1px solid rgba(0,255,204,.3);padding:1px 5px}
.llm-pull-hint{font-size:9px;color:var(--td);margin-top:8px}
.llm-quick-btns{display:flex;flex-wrap:wrap;gap:5px}
.llm-quick-btn{background:transparent;border:1px solid var(--bd);color:var(--td);font-family:var(--mono);font-size:9px;padding:4px 10px;cursor:pointer;transition:all .15s}
.llm-quick-btn:hover{border-color:#00ffcc;color:#00ffcc}
`
}

const BUILTIN_SKILLS = [
  { id: 'sentinel-ai', name: 'SENTINEL-AI Core', icon: '◈', color: '#00d4ff', category: 'domain', builtin: true, global: false,
    description: 'Edge AI, Jetson Orin, blockchain L2',
    content: 'PROJECT: SENTINEL-AI\n- Autonomous edge AI video analytics\n- Hardware: NVIDIA Jetson Orin\n- Blockchain L2 event logging\n- Privacy-by-Design required\n- B2B SaaS model\n- Polish NCBR INFOSTRATEG grant compliance' },
  { id: 'go-backend', name: 'Go Backend', icon: '⌥', color: '#00ff88', category: 'tech', builtin: true, global: false,
    description: 'Go, Fiber, pgxpool, Redis, Asynq',
    content: 'TECH: GO BACKEND\n- Go 1.22+, Fiber (fasthttp)\n- pgxpool for PostgreSQL\n- Redis with go-redis\n- Asynq for background jobs\n- Prometheus + OpenTelemetry\n- JWT RS256 auth' },
  { id: 'soc2', name: 'SOC 2 Ready', icon: '⚷', color: '#e040fb', category: 'compliance', builtin: true, global: false,
    description: 'Audit-first, SOC 2 controls',
    content: 'COMPLIANCE: SOC 2 TYPE II\n- Audit evidence from day one\n- Log all actions with context\n- AES-256-GCM at rest, TLS 1.3 in transit\n- RBAC least-privilege\n- 90-day key rotation\n- 1-year log retention\n- Map to CC6/CC7/CC8/CC9' },
  { id: 'do-infra', name: 'DigitalOcean Infra', icon: '⚙', color: '#00e5ff', category: 'tech', builtin: true, global: false,
    description: 'DO droplets, managed DBs, Terraform',
    content: 'INFRA: DIGITALOCEAN\n- Compute: 2vCPU/4GB Droplets\n- Managed PostgreSQL + PgBouncer\n- Managed Redis\n- Spaces (S3-compatible)\n- Region: fra1\n- Server: api.safecitysentinel.com' },
  { id: 'owasp', name: 'OWASP Top 10', icon: '☠', color: '#ff6b35', category: 'security', builtin: true, global: false,
    description: 'OWASP checklist for every feature',
    content: 'SECURITY: OWASP TOP 10\nA01: Broken Access Control\nA02: Cryptographic Failures\nA03: Injection — parameterized queries only\nA04: Insecure Design\nA05: Security Misconfiguration\nA06: Vulnerable Components\nA07: Auth Failures\nA08: Integrity Failures\nA09: Logging Failures\nA10: SSRF' },
  { id: 'polish', name: 'Polish Legal & Grant', icon: '⬡', color: '#ffd700', category: 'domain', builtin: true, global: false,
    description: 'NCBR grant, JDG, IP Box, RODO',
    content: 'LEGAL: POLAND\n- JDG sole proprietor, SENTINEL-AI brand\n- NCBR INFOSTRATEG IX grant alignment\n- IP Box: 5% CIT rate for R&D\n- RODO (Polish GDPR)\n- Formal docs in Polish' },
  SENTINEL_VAULT_SKILL,
  { id: 'skill-architect',   name: 'System Design Patterns', icon: '◈', color: '#00d4ff', category: 'tech',       builtin: true, global: false,
    description: 'Hexagonal arch, CQRS, 12-Factor, design for failure',
    content: 'ARCHITECTURE BEST PRACTICES:\n- Hexagonal architecture (ports & adapters) — isolate business logic from infrastructure\n- CQRS: separate read/write models for high-throughput systems\n- Event sourcing for audit trails and time-travel debugging\n- 12-Factor App principles: config via env, stateless processes, disposable containers\n- Design for failure: circuit breakers, retries with exponential backoff, bulkheads\n- API-first design: OpenAPI spec before implementation\n- Always document: why a decision was made, not just what was decided' },
  { id: 'skill-codegen',     name: 'Go Best Practices',      icon: '⌥', color: '#00ff88', category: 'tech',       builtin: true, global: false,
    description: 'Go idioms, error wrapping, context, testing patterns',
    content: 'GO CODING STANDARDS:\n- Error wrapping: fmt.Errorf("context: %w", err)\n- Context propagation: first param of every function that does I/O\n- Interfaces: define at point of use, not implementation\n- Table-driven tests with t.Run() subtests\n- sync.RWMutex for read-heavy concurrent maps\n- pgxpool: always use context, never ignore pgx.ErrNoRows\n- Structured logging: slog or zerolog\n- Graceful shutdown: SIGTERM + drain in-flight requests\n- go test -race must pass\n- Benchmark critical paths: go test -bench -benchmem' },
  { id: 'skill-tester',      name: 'Test Pyramid Go',        icon: '⊡', color: '#b060ff', category: 'tech',       builtin: true, global: false,
    description: '70/20/10 pyramid, testcontainers, table-driven',
    content: 'TESTING STRATEGY:\n70% unit (pure, fast), 20% integration (real DB via testcontainers-go), 10% E2E\n- Table-driven: []struct{ name, input, expected }\n- t.Parallel() on all unit tests\n- testcontainers-go for PostgreSQL/Redis in CI — no mocks for data layer\n- httptest.NewRecorder() for handler tests\n- goleak for goroutine leak detection\nCOVERAGE: crypto 95%+, business logic 85%+, handlers 80%+' },
  { id: 'skill-cybersec',    name: 'STRIDE + MITRE ATT&CK',  icon: '☠', color: '#ff6b35', category: 'security',   builtin: true, global: false,
    description: 'Full threat taxonomy, defense in depth',
    content: 'THREAT MODELING:\nSTRIDE: Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation of Privilege\nMITRE ATT&CK: T1552 creds in files, T1190 exploit public app, T1078 valid accounts, T1110 brute force\nDEFENSE IN DEPTH:\n- Network: TLS 1.3 minimum\n- Application: input validation, output encoding, parameterized queries\n- Data: encryption at rest, column-level for PII\n- Monitoring: alert on auth failures and unusual data access' },
  { id: 'skill-crypto',      name: 'NIST Crypto Standards',  icon: '⚷', color: '#e040fb', category: 'security',   builtin: true, global: false,
    description: 'NIST 2024 approved algorithms, key management',
    content: 'CRYPTOGRAPHIC STANDARDS (NIST 2024):\nAPPROVED: AES-256-GCM, ChaCha20-Poly1305, SHA-256+, HKDF-SHA256, Argon2id, Ed25519, X25519\nDEPRECATED (never use): MD5, SHA-1, DES, 3DES, RC4, ECB mode, RSA < 2048\nKEY MANAGEMENT:\n- Separate data keys from master keys\n- Rotate: data keys 90 days, master keys 1 year\n- Store master keys in HSM/KMS, never on app server\n- Always use HKDF, never reuse keys across contexts' },
  { id: 'skill-devops',      name: 'GitOps + 12-Factor',     icon: '⚙', color: '#00e5ff', category: 'tech',       builtin: true, global: false,
    description: 'Immutable infra, declarative config, GitOps',
    content: '12-FACTOR APP:\n1. Codebase: one repo, many deploys\n3. Config: env vars only\n6. Processes: stateless, share-nothing\n9. Disposability: fast startup (<5s), graceful shutdown\n11. Logs: stdout only\nGITOPS:\n- Infrastructure as code: Terraform for all DO resources\n- No manual changes to production\n- Rollback = git revert + push' },
  { id: 'skill-dataeng',     name: 'PostgreSQL Performance', icon: '⊞', color: '#ff9e80', category: 'tech',       builtin: true, global: false,
    description: 'Schema design, indexing, PgBouncer, migrations',
    content: 'POSTGRESQL BEST PRACTICES:\nSCHEMA: UUIDs (gen_random_uuid()), created_at/updated_at on every table, soft deletes with deleted_at\nINDEXING: index every FK, partial indexes (WHERE deleted_at IS NULL), EXPLAIN ANALYZE before declaring query fast\nCONNECTIONS: pgxpool min=2 max=20, PgBouncer transaction mode for high concurrency\nMIGRATIONS: sequential versioned files (001_initial.sql), always include down migration, never modify existing' },
  { id: 'skill-performance', name: 'Google SRE Principles',  icon: '⚡', color: '#ffeb3b', category: 'tech',       builtin: true, global: false,
    description: 'SLO/error budget, k6 load testing, pprof',
    content: 'SRE STANDARDS:\nSLO: 99.9% availability, p50<10ms, p95<50ms, p99<200ms for secret reads\nERROR BUDGET: burn rate alerts at 2x and 5x\nk6 TESTS: smoke (1VU/1min), load (ramp to target/30min), stress (2x peak), soak (80%/4h)\nSENTINEL VAULT TARGETS: cache hit <5ms p99, cache miss <20ms p99, write+ratchet <50ms p99\nPROFILING: pprof in dev, CPU profile under load, pg_stat_statements for DB' },
  { id: 'skill-docs',        name: 'Diátaxis Framework',     icon: '❋', color: '#ffd700', category: 'process',    builtin: true, global: false,
    description: 'Tutorials/how-to/reference/explanation structure',
    content: 'DOCUMENTATION FRAMEWORK (Diátaxis):\n- TUTORIALS: learning-oriented, hand-holding\n- HOW-TO GUIDES: task-oriented, assumes knowledge\n- REFERENCE: accurate, complete, dry\n- EXPLANATION: understanding-oriented, "why"\nREADME: one-sentence description, 60-second quick start, installation, config reference\nAPI DOCS: every endpoint needs description, auth, request schema, response schema, errors, curl example' },
  { id: 'skill-commit',      name: 'Conventional Commits',   icon: '⎇', color: '#40c4ff', category: 'process',    builtin: true, global: false,
    description: 'Commit format, branch strategy, PR requirements',
    content: 'GIT STANDARDS:\nCOMMITS: feat:, fix:, feat!: (breaking), chore:, docs:, test:, refactor:, perf:\nBRANCHES: main (protected), develop, feat/name, fix/name, release/v1.2.0\nPR REQUIREMENTS: all tests green, 1 reviewer, no secrets in diff (gitleaks), conventional commit message, CHANGELOG updated' },
]

const MSG_TYPES = {
  status:   { label: 'Status',   color: '#3a5060', bg: 'transparent' },
  finding:  { label: 'Finding',  color: '#00d4ff', bg: 'rgba(0,212,255,.05)' },
  conflict: { label: 'Conflict', color: '#ff4560', bg: 'rgba(255,69,96,.06)' },
  handoff:  { label: 'Handoff',  color: '#00ff88', bg: 'rgba(0,255,136,.05)' },
  warning:  { label: 'Warning',  color: '#ff9500', bg: 'rgba(255,149,0,.05)' },
  complete: { label: 'Complete', color: '#b060ff', bg: 'rgba(176,96,255,.05)' },
  user:     { label: 'You',      color: '#ffffff', bg: 'rgba(255,255,255,.04)' },
  system:   { label: 'System',   color: '#3a5060', bg: 'transparent' },
}

function uid()  { return Math.random().toString(36).slice(2, 9) }
function ts(tz) {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}
function tsDate(tz) {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}
function detectTZ() { return Intl.DateTimeFormat().resolvedOptions().timeZone }
function etok(t) { return Math.ceil((t || '').length / 4) }
function ecost(mk, i, o) { const m = MODELS[mk]; if (!m) return 0; return (i / 1e6) * m.costIn + (o / 1e6) * m.costOut }

function resolveModel(agentId, routing, budget, spent, localLLM) {
  const assigned = routing[agentId] || 'claude-sonnet-4-20250514'
  // If local LLM enabled and agent is routed to a local model — use it directly
  if (localLLM && localLLM.enabled && assigned.startsWith('ollama/')) return assigned
  // If local LLM enabled and quickRoute set — override all agents
  if (localLLM && localLLM.enabled && localLLM.quickRoute) return localLLM.quickRoute
  const pct = budget.sessionBudget > 0 ? spent / budget.sessionBudget : 0
  if (budget.autoDowngrade) {
    if (pct >= 0.85) {
      // If local LLM enabled with fallback — use local instead of Groq
      if (localLLM && localLLM.enabled && localLLM.fallback) return 'ollama/llama3.2'
      return DOWNGRADE[assigned] || 'llama-3.3-70b-versatile'
    }
    if (pct >= 0.60 && MODELS[assigned] && MODELS[assigned].costIn > 1) return DOWNGRADE[assigned] || assigned
  }
  return assigned
}

function buildPrompt(agent, cfg, skills, timezone) {
  let sys = agent.systemPrompt
  const adds = []
  const ids = []
  skills.forEach(function(s) { if (s.global) ids.push(s.id) })
  if (cfg && cfg.skills) cfg.skills.forEach(function(sid) { if (!ids.includes(sid)) ids.push(sid) })
  ids.forEach(function(sid) {
    const sk = skills.find(function(s) { return s.id === sid })
    if (sk) adds.push('--- SKILL: ' + sk.name + ' ---\n' + sk.content)
  })
  if (cfg && cfg.techStack)          adds.push('TECH STACK:\n' + cfg.techStack)
  if (cfg && cfg.repoContext)        adds.push('CODEBASE:\n' + cfg.repoContext.readme + '\n\nFILE TREE:\n' + cfg.repoContext.fileTree)
  if (cfg && cfg.customInstructions) adds.push('ADDITIONAL:\n' + cfg.customInstructions)
  // Inject timezone context
  if (timezone) {
    adds.push('TIMEZONE CONTEXT:\n- User timezone: ' + timezone + '\n- Current time: ' + new Date().toLocaleString('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }) + '\n- Always use this timezone for all timestamps, logs, schedules, and time-based configurations\n- PostgreSQL: SET timezone = \'' + timezone + '\'; in session config\n- Go: use time.LoadLocation("' + timezone + '") not time.UTC unless explicitly storing UTC\n- Cron expressions: calculate in ' + timezone + ' not UTC')
  }
  if (cfg && cfg.overrideMode && cfg.customInstructions) return cfg.customInstructions
  return adds.length ? sys + '\n\n---\n\n' + adds.join('\n\n') : sys
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

function ChatMsg({ msg, agents, onPin, onReact, pinned }) {
  const agent = agents.find(function(a) { return a.id === msg.agentId })
  const ts    = MSG_TYPES[msg.type] || MSG_TYPES.status
  const [expanded, setExpanded] = useState(false)
  const isLong   = (msg.text || '').length > 280
  const isSystem = msg.type === 'system'
  const col      = (agent && agent.color) || ts.color
  return (
    <div className={'cmsg ' + msg.type + (pinned ? ' pinned' : '')} style={{ '--mc': col, background: ts.bg }}>
      {!isSystem && (
        <div className="cmsg-hdr">
          <div className="cmsg-avatar" style={{ background: col + '22', border: '1px solid ' + col + '55', color: col }}>
            {msg.type === 'user' ? 'YOU' : (agent && agent.avatar) || '??'}
          </div>
          <div className="cmsg-meta">
            <span className="cmsg-name" style={{ color: col }}>{msg.type === 'user' ? 'You' : (agent && agent.name) || msg.agentId}</span>
            <span className="cmsg-type" style={{ color: ts.color, borderColor: ts.color + '44' }}>{ts.label}</span>
          </div>
          <span className="cmsg-ts">{msg.ts}</span>
          <div className="cmsg-actions">
            <button className={'cmsg-act' + (pinned ? ' active' : '')} onClick={function() { onPin(msg.id) }}>📌</button>
            <button className={'cmsg-act' + (msg.reaction === '👍' ? ' active' : '')} onClick={function() { onReact(msg.id, '👍') }}>👍</button>
            <button className={'cmsg-act' + (msg.reaction === '🚩' ? ' active' : '')} onClick={function() { onReact(msg.id, '🚩') }}>🚩</button>
          </div>
        </div>
      )}
      <div className={'cmsg-body' + (isSystem ? ' cmsg-sys' : '')}>
        {isSystem
          ? <span style={{ color: '#3a5060', fontSize: 10 }}>— {msg.text} —</span>
          : <div>
              <div dangerouslySetInnerHTML={{ __html: md(isLong && !expanded ? msg.text.slice(0, 280) + '...' : msg.text) }} />
              {isLong && <button className="expand-txt" onClick={function() { setExpanded(function(e) { return !e }) }}>{expanded ? '▲ collapse' : '▼ read more'}</button>}
            </div>
        }
      </div>
      {msg.reaction && <div className="cmsg-reaction">{msg.reaction}</div>}
    </div>
  )
}

function ChatPanel({ messages, agents, onSend, isRunning, pinnedIds, onPin, onReact, filter, setFilter }) {
  const [input, setInput] = useState('')
  const [showPinned, setShowPinned] = useState(false)
  const bottomRef = useRef(null)
  useEffect(function() { bottomRef.current && bottomRef.current.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const filtered = useMemo(function() {
    let msgs = showPinned ? messages.filter(function(m) { return pinnedIds.has(m.id) }) : messages
    if      (filter === 'conflicts') msgs = msgs.filter(function(m) { return m.type === 'conflict' || m.type === 'warning' })
    else if (filter === 'findings')  msgs = msgs.filter(function(m) { return m.type === 'finding'  || m.type === 'complete' })
    else if (filter === 'handoffs')  msgs = msgs.filter(function(m) { return m.type === 'handoff' })
    else if (filter !== 'all')       msgs = msgs.filter(function(m) { return m.agentId === filter || m.type === 'user' || m.type === 'system' })
    return msgs
  }, [messages, filter, showPinned, pinnedIds])
  function send() { const t = input.trim(); if (!t) return; onSend(t); setInput('') }
  const mm = input.match(/^@(\w+)/)
  const mentionedAgent = mm ? agents.find(function(a) { return a.name.toLowerCase().startsWith(mm[1].toLowerCase()) }) : null
  return (
    <div className="chat-panel">
      <div className="chat-hdr">
        <div className="chat-title"><span style={{ color: '#00d4ff' }}>◈</span> Agent Channel {isRunning && <span className="live-badge">● LIVE</span>}</div>
        <button className={'chat-pin-btn' + (showPinned ? ' active' : '')} onClick={function() { setShowPinned(function(p) { return !p }) }}>📌 {pinnedIds.size}</button>
      </div>
      <div className="chat-filters">
        {[['all','All'],['conflicts','⚠ Conflicts'],['findings','◈ Findings'],['handoffs','→ Handoffs']].map(function(item) {
          return <button key={item[0]} className={'cf-btn' + (filter === item[0] ? ' active' : '')} onClick={function() { setFilter(item[0]) }}>{item[1]}</button>
        })}
        <div className="cf-div" />
        {agents.filter(function(a) { return !a.isOrchestrator }).map(function(a) {
          return <button key={a.id} className={'cf-btn' + (filter === a.id ? ' active' : '')} style={filter === a.id ? { borderColor: a.color, color: a.color } : {}} onClick={function() { setFilter(filter === a.id ? 'all' : a.id) }}><span style={{ color: a.color }}>{a.icon}</span></button>
        })}
      </div>
      <div className="chat-messages">
        {filtered.length === 0 && <div className="chat-empty"><div className="ce-icon">◈</div><div>{messages.length === 0 ? 'Deploy agents to start' : 'No messages match filter'}</div></div>}
        {filtered.map(function(msg) { return <ChatMsg key={msg.id} msg={msg} agents={agents} onPin={onPin} onReact={onReact} pinned={pinnedIds.has(msg.id)} /> })}
        <div ref={bottomRef} />
      </div>
      {mentionedAgent && <div className="mention-hint" style={{ borderColor: mentionedAgent.color }}><span style={{ color: mentionedAgent.color }}>{mentionedAgent.icon}</span> Directing to <strong style={{ color: mentionedAgent.color }}>{mentionedAgent.name}</strong>{isRunning ? ' — live interrupt' : ' — re-run after'}</div>}
      <div className="chat-input-row">
        <div className="chat-input-wrap">
          <textarea className="chat-input" rows={2} placeholder={isRunning ? '@AgentName to interrupt...' : '@AgentName to re-prompt...'} value={input} onChange={function(e) { setInput(e.target.value) }} onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="chat-send" onClick={send} disabled={!input.trim()}>↑</button>
        </div>
        <div className="chat-hint">Enter to send · Shift+Enter newline · @name to direct</div>
      </div>
    </div>
  )
}

function AgentCard({ agent, status, output, progress, modelKey, cost, onExpand }) {
  const m = MODELS[modelKey]
  return (
    <div className={'acard ' + status} style={{ '--ac': agent.color }}>
      <div className="acard-bar">{(status === 'streaming' || status === 'done') && <div className="acard-fill" style={{ width: (status === 'done' ? 100 : progress) + '%', background: agent.color }} />}</div>
      <div className="acard-hdr">
        <span style={{ color: agent.color, fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{agent.icon}</span>
        <div className="acard-meta"><div className="acard-name">{agent.name}</div><div className="acard-lbl">{agent.label}</div></div>
        <div className="acard-right">
          {m && <span className="model-tag" style={{ borderColor: m.free ? '#00ffcc' : '#1e3040', color: m.free ? '#00ffcc' : '#3a5060' }}>{m.free ? '✦ ' : ''}{m.label}</span>}
          {cost > 0 && <span className="cost-tag">${cost.toFixed(4)}</span>}
          <span className={'sdot ' + status} />
        </div>
      </div>
      <div className="acard-body">
        {status === 'idle'    && <div className="ph"><span style={{ color: agent.color, opacity: .18 }}>{agent.icon}</span><span>Awaiting...</span></div>}
        {status === 'waiting' && <div className="ph pulse"><span style={{ color: agent.color }}>◌</span><span>Routing...</span></div>}
        {(status === 'streaming' || status === 'done') && output && <div className="out" dangerouslySetInnerHTML={{ __html: md(output) }} />}
        {status === 'error' && <div className="out-err">⚠ {output}</div>}
      </div>
      {status === 'done' && <div className="acard-foot"><span style={{ color: agent.color }}>✓</span><span>{(output || '').split(' ').length}w</span><button className="expand-btn" onClick={function() { onExpand(agent.id) }}>EXPAND ↗</button></div>}
    </div>
  )
}

export default function App() {
  const [user,       setUser]       = useState(isLoggedIn() ? getUser() : null)
  const [page,       setPage]       = useState('run')
  const [req,        setReq]        = useState('')
  const [routing,    setRouting]    = useState(DEFAULT_ROUTING)
  const [budget,     setBudget]     = useState({ sessionBudget: 0.50, monthlyBudget: 15, autoDowngrade: true, preferFree: true })
  const [agentCfgs,  setAgentCfgs]  = useState({})
  const [skills,     setSkills]     = useState(BUILTIN_SKILLS.map(function(s) { return Object.assign({}, s) }))
  const [loaded,     setLoaded]     = useState(false)
  const [states,     setStates]     = useState(function() { return Object.fromEntries(AGENTS.map(function(a) { return [a.id, { status: 'idle', output: '', progress: 0, model: null, cost: 0 }] })) })
  const [msgs,       setMsgs]       = useState([])
  const [chatFilter, setChatFilter] = useState('all')
  const [pinned,     setPinned]     = useState(new Set())
  const [scrumPlan,  setScrumPlan]  = useState('')
  const [scrumSynth, setScrumSynth] = useState('')
  const [planPhase,  setPlanPhase]  = useState(null)
  const [synthPhase, setSynthPhase] = useState(null)
  const [running,    setRunning]    = useState(false)
  const [spent,      setSpent]      = useState(0)
  const [sessions,   setSessions]   = useState([])
  const [modal,      setModal]      = useState(null)
  const [chatSplit,  setChatSplit]  = useState(38)
  const [interrupts,    setInterrupts]    = useState([])
  const [activeProject, setActiveProject] = useState('sentinel-vault')
  const [localLLM,      setLocalLLM]      = useState({ enabled: false, endpoint: 'http://localhost:11434', fallback: true, quickRoute: null })
  const [timezone,      setTimezone]      = useState(detectTZ())
  const [execResult,    setExecResult]    = useState(null)
  const [execFiles,     setExecFiles]     = useState([])
  const [showApproval,  setShowApproval]  = useState(false)
  const [saveStatus, setSaveStatus] = useState('')

  const statesRef     = useRef(states)
  const spentRef      = useRef(0)
  const runningRef    = useRef(running)
  const interruptsRef = useRef(interrupts)
  const sessionId     = useRef(uid())
  const scrumPlanRef  = useRef('')
  const scrumSynthRef = useRef('')
  const saveTimer     = useRef(null)

  useEffect(function() { statesRef.current     = states     }, [states])
  useEffect(function() { runningRef.current    = running    }, [running])
  useEffect(function() { interruptsRef.current = interrupts }, [interrupts])
  useEffect(function() { scrumPlanRef.current  = scrumPlan  }, [scrumPlan])
  useEffect(function() { scrumSynthRef.current = scrumSynth }, [scrumSynth])

  // ── Load persisted skills + settings on login ──────────────────────────────
  useEffect(function() {
    if (!user || loaded) return
    async function load() {
      // Load remote skills and settings
      try {
        const [remoteSkills, remoteSettings] = await Promise.all([loadSkills(), loadSettings()])
        if (remoteSkills && remoteSkills.length > 0) {
          const builtinIds = BUILTIN_SKILLS.map(function(s) { return s.id })
          const custom     = remoteSkills.filter(function(s) { return !builtinIds.includes(s.id) })
          const builtins   = BUILTIN_SKILLS.map(function(b) {
            const saved = remoteSkills.find(function(s) { return s.id === b.id })
            return saved ? Object.assign({}, b, { global: saved.global }) : b
          })
          setSkills([...builtins, ...custom])
        }
        if (remoteSettings && Object.keys(remoteSettings).length > 0) {
          if (remoteSettings.routing)       setRouting(remoteSettings.routing)
          if (remoteSettings.budgetSettings) setBudget(remoteSettings.budgetSettings)
          if (remoteSettings.agentConfigs)  setAgentCfgs(remoteSettings.agentConfigs)
          if (remoteSettings.localLLM)      setLocalLLM(remoteSettings.localLLM)
          if (remoteSettings.timezone)      setTimezone(remoteSettings.timezone)
          if (remoteSettings.activeProject) setActiveProject(remoteSettings.activeProject)
        }
      } catch(e) { console.log('settings load error', e) }

      // Restore last session from localStorage
      try {
        const last = localStorage.getItem('agentpool_last_session')
        if (last) {
          const s = JSON.parse(last)
          if (s && s.req) {
            setReq(s.req)
            setScrumPlan(s.scrumPlan || '')
            setScrumSynth(s.scrumSynth || '')
            setPlanPhase(s.scrumPlan ? 'done' : null)
            setSynthPhase(s.scrumSynth ? 'done' : null)
            if (s.outputs) {
              setStates(function(prev) {
                const next = Object.assign({}, prev)
                Object.entries(s.outputs).forEach(function(entry) {
                  if (entry[1]) {
                    next[entry[0]] = { status: 'done', output: entry[1], progress: 100, model: null, cost: 0 }
                  }
                })
                return next
              })
            }
          }
        }
      } catch(e) { console.log('session restore error', e) }

      setLoaded(true)
    }
    load()
  }, [user, loaded])

  // ── Auto-save skills whenever they change ──────────────────────────────────
  useEffect(function() {
    if (!user || !loaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(function() {
      saveSkills(skills)
      setSaveStatus('✓ saved')
      setTimeout(function() { setSaveStatus('') }, 2000)
    }, 1000)
  }, [skills, user, loaded])

  // ── Auto-save settings whenever routing/budget/agentCfgs change ───────────
  useEffect(function() {
    if (!user || !loaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(function() {
      saveSettings(routing, budget, agentCfgs, localLLM, activeProject, timezone)
    }, 1000)
  }, [routing, budget, agentCfgs, user, loaded])

  const workers = AGENTS.filter(function(a) { return !a.isOrchestrator })
  const scrum   = AGENTS.find(function(a)   { return  a.isOrchestrator })

  const updState = useCallback(function(id, patch) { setStates(function(p) { return Object.assign({}, p, { [id]: Object.assign({}, p[id], patch) }) }) }, [])
  const addCost  = useCallback(function(amt) { spentRef.current += amt; setSpent(spentRef.current) }, [])
  const addMsg   = useCallback(function(agentId, type, text) { setMsgs(function(p) { return [...p, { id: uid(), agentId: agentId, type: type, text: text, ts: ts(timezone), reaction: null }] }) }, [timezone])

  const handlePin   = useCallback(function(id) { setPinned(function(p) { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }, [])
  const handleReact = useCallback(function(id, r) { setMsgs(function(p) { return p.map(function(m) { return m.id === id ? Object.assign({}, m, { reaction: m.reaction === r ? null : r }) : m }) }) }, [])

  const handleUserMsg = useCallback(async function(text) {
    addMsg('user', 'user', text)
    const mm = text.match(/^@(\w+)\s+([\s\S]*)/)
    if (!mm) return
    const target = workers.find(function(a) { return a.name.toLowerCase().startsWith(mm[1].toLowerCase()) })
    if (!target) return
    if (runningRef.current) {
      setInterrupts(function(p) { return [...p, { agentId: target.id, text: mm[2], ts: Date.now() }] })
      addMsg('system', 'system', 'Interrupt queued for ' + target.name)
    } else {
      addMsg('system', 'system', 'Re-running ' + target.name + '...')
      updState(target.id, { status: 'streaming', output: '', progress: 5, model: resolveModel(target.id, routing, budget, spentRef.current, localLLM) })
      try {
        const mk = routing[target.id] || 'claude-sonnet-4-20250514'
        const sys = buildPrompt(target, agentCfgs[target.id], skills, timezone)
        let out = ''
        await streamAgent({ model: mk, system: sys, messages: [{ role: 'user', content: 'Requirement: ' + req + '\n\nInstruction: ' + mm[2] }], agentId: target.id, sessionId: sessionId.current,
          onChunk: function(chunk) { out += chunk; updState(target.id, { output: out, progress: Math.min(95, 5 + (out.length / 2000) * 90) }) }
        })
        updState(target.id, { status: 'done', output: out, progress: 100 })
        addMsg(target.id, 'complete', 'Re-run complete — ' + out.split(' ').length + 'w')
      } catch(e) { updState(target.id, { status: 'error', output: e.message }); addMsg(target.id, 'warning', e.message) }
    }
  }, [addMsg, workers, req, routing, agentCfgs, skills, updState])

  const runAll = useCallback(async function() {
    if (!req.trim() || running) return
    setRunning(true); setModal(null)
    setScrumPlan(''); setScrumSynth('')
    setPlanPhase(null); setSynthPhase(null)
    spentRef.current = 0; setSpent(0)
    sessionId.current = uid()
    setMsgs([]); setInterrupts([])
    workers.forEach(function(a) { updState(a.id, { status: 'idle', output: '', progress: 0, model: null, cost: 0 }) })

    addMsg('system', 'system', 'Session started — ' + workers.length + ' agents deploying')
    addMsg('scrum', 'status', 'Analyzing requirement...')
    setPlanPhase('active')
    try {
      const sys = buildPrompt(scrum, agentCfgs.scrum, skills, timezone)
      let plan = ''
      await streamAgent({ model: routing.scrum || 'claude-sonnet-4-20250514', system: sys,
        messages: [{ role: 'user', content: 'Technical Requirement:\n\n' + req }],
        agentId: 'scrum', sessionId: sessionId.current,
        onChunk: function(chunk) { plan += chunk; setScrumPlan(plan) }
      })
      addMsg('scrum', 'finding', 'Sprint plan ready — ' + plan.split(' ').length + 'w')
    } catch(e) { setScrumPlan('⚠ ' + e.message); addMsg('scrum', 'warning', e.message) }
    setPlanPhase('done')

    addMsg('system', 'system', 'All agents dispatched — running in parallel')
    workers.forEach(function(a) { updState(a.id, { status: 'waiting', progress: 0 }) })

    await Promise.allSettled(workers.map(async function(agent) {
      const mk = resolveModel(agent.id, routing, budget, spentRef.current, localLLM)
      updState(agent.id, { status: 'streaming', progress: 5, model: mk })
      addMsg(agent.id, 'status', 'Starting with ' + ((MODELS[mk] && MODELS[mk].label) || mk) + '...')
      try {
        const sys = buildPrompt(agent, agentCfgs[agent.id], skills, timezone)
        let out = '', chars = 0, lastChk = Date.now()
        await streamAgent({ model: mk, system: sys,
          messages: [{ role: 'user', content: 'Technical Requirement:\n\n' + req + '\n\nProvide your specialized analysis. Prefix key findings with "NOTE FOR TEAM:"' }],
          agentId: agent.id, sessionId: sessionId.current,
          onChunk: function(chunk) {
            out += chunk; chars += chunk.length
            updState(agent.id, { output: out, progress: Math.min(95, 5 + (chars / 2000) * 90) })
            if (Date.now() - lastChk > 2000) {
              lastChk = Date.now()
              const mine = interruptsRef.current.filter(function(i) { return i.agentId === agent.id && i.ts > Date.now() - 30000 })
              if (mine.length) { addMsg(agent.id, 'reply', 'Acknowledged: "' + mine[mine.length-1].text.slice(0,60) + '"'); setInterrupts(function(p) { return p.filter(function(i) { return i.agentId !== agent.id }) }) }
            }
            if (out.includes('NOTE FOR TEAM:') && !out.slice(0, -chunk.length).includes('NOTE FOR TEAM:')) {
              const nm = out.match(/NOTE FOR TEAM:([^\n]+)/)
              if (nm) addMsg(agent.id, 'finding', '📢 ' + nm[1].trim())
            }
          }
        })
        const fc = ecost(mk, etok(sys), etok(out))
        addCost(fc)
        updState(agent.id, { status: 'done', output: out, progress: 100, cost: fc })
        addMsg(agent.id, 'complete', 'Done — ' + out.split(' ').length + 'w · $' + fc.toFixed(5))
        if (agent.id === 'reviewer' && (out.toLowerCase().includes('critical') || out.toLowerCase().includes('vulnerability')))
          addMsg(agent.id, 'conflict', '⚠ Critical security findings — review before implementation')
        if (agent.id === 'architect')    addMsg(agent.id, 'handoff', 'Architecture ready → CodeGen · Data Engineer should align')
        if (agent.id === 'dataeng')      addMsg(agent.id, 'handoff', 'Schema ready → CodeGen can reference data layer')
        if (agent.id === 'devops')       addMsg(agent.id, 'handoff', 'CI/CD ready → Commit Control should verify')
        if (agent.id === 'performance')  addMsg(agent.id, 'handoff', 'Perf targets set → Architect and CodeGen should align')
        sendNotification('agent_complete', { agent: agent.name }).catch(function() {})
      } catch(e) {
        updState(agent.id, { status: 'error', output: e.message, progress: 0 })
        addMsg(agent.id, 'warning', 'Failed: ' + e.message)
      }
    }))

    setSynthPhase('active')
    addMsg('scrum', 'status', 'Synthesizing all outputs...')
    try {
      const allOut = workers.map(function(a) { return '=== ' + a.name.toUpperCase() + ' ===\n' + ((statesRef.current[a.id] && statesRef.current[a.id].output) || '(no output)') }).join('\n\n')
      let synth = ''
      await streamAgent({ model: routing.scrum || 'claude-sonnet-4-20250514', system: scrum.synthPrompt,
        messages: [{ role: 'user', content: 'Requirement:\n' + req + '\n\nAGENT OUTPUTS:\n' + allOut.slice(0, 6000) }],
        agentId: 'scrum-synth', sessionId: sessionId.current,
        onChunk: function(chunk) { synth += chunk; setScrumSynth(synth) }
      })
      addMsg('scrum', 'complete', 'Synthesis complete — ' + synth.split(' ').length + 'w')
    } catch(e) { setScrumSynth('⚠ ' + e.message); addMsg('scrum', 'warning', e.message) }
    setSynthPhase('done')

    addMsg('system', 'system', 'Session complete · $' + spentRef.current.toFixed(5))
    sendNotification('session_complete', { req: req.slice(0, 60), cost: spentRef.current }).catch(function() {})

    // Capture all final outputs and save
    const finalOutputs = {}
    workers.forEach(function(a) {
      finalOutputs[a.id] = (statesRef.current[a.id] && statesRef.current[a.id].output) || ''
    })
    saveSession(
      sessionId.current, req, Date.now(), spentRef.current,
      finalOutputs,
      scrumPlanRef.current || scrumPlan || '',
      scrumSynthRef.current || scrumSynth || ''
    ).catch(function() {})
    try {
      localStorage.setItem('agentpool_last_session', JSON.stringify({
        id: sessionId.current, req: req, ts: Date.now(),
        cost: spentRef.current, outputs: finalOutputs,
        scrumPlan: scrumPlanRef.current || scrumPlan || '',
        scrumSynth: scrumSynthRef.current || scrumSynth || '',
      }))
    } catch(e) {}
    setSessions(function(p) { return [...p, { req: req, cost: spentRef.current, ts: Date.now() }] })
    setRunning(false)
  }, [req, running, routing, budget, agentCfgs, skills, workers, scrum, updState, addCost, addMsg])

  if (!user) return <Login onLogin={function(u) { setUser(u) }} />
  if (!loaded) return <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#07090c', color:'#3a5060', fontFamily:'JetBrains Mono,monospace', fontSize:12 }}>◌ Loading...</div>

  const doneCount  = workers.filter(function(a) { return states[a.id] && states[a.id].status === 'done' }).length
  const totalProg  = running ? Math.round(workers.reduce(function(s,a) { return s + ((states[a.id] && states[a.id].progress) || 0) }, 0) / workers.length) : doneCount > 0 ? 100 : 0
  const hasRun     = planPhase !== null
  const conflicts  = msgs.filter(function(m) { return m.type === 'conflict' || m.type === 'warning' }).length
  const modalAgent = modal ? AGENTS.find(function(a) { return a.id === modal }) : null
  const modalState = modal ? states[modal] : null

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-left">
            <div className="logo">⬡</div>
            <div>
              <div className="nav-title">AGENT<span>POOL</span></div>
              <div className="nav-sub">14 Agents · Memory · Local LLM</div>
            </div>
          </div>
          <div className="nav-tabs">
            {[['run','▶ Run'],['skills','◆ Skills'],['sessions','◎ History'],['memory','◈ Memory'],['config','⚙ Config']].map(function(item) {
              return <button key={item[0]} className={'ntab' + (page === item[0] ? ' active' : '')} onClick={function() { setPage(item[0]) }}>{item[1]}</button>
            })}
          </div>
          <div className="nav-right">
            {saveStatus && <span style={{ fontSize: 9, color: '#00ffcc', letterSpacing: 1 }}>{saveStatus}</span>}
            <div className="stat"><div className="sv" style={{ color: '#00ff88' }}>{doneCount}</div><div className="sl">Done</div></div>
            {conflicts > 0 && <div className="stat"><div className="sv" style={{ color: '#ff4560' }}>{conflicts}</div><div className="sl">Flags</div></div>}
            <div className="stat"><div className="sv" style={{ color: '#00d4ff' }}>${spent.toFixed(4)}</div><div className="sl">Spent</div></div>
            <div className="nav-user">
              <span>{user.username}</span>
              <span className="nav-role">{user.role}</span>
              <button className="logout-btn" onClick={function() { logout(); setUser(null) }}>↩</button>
            </div>
          </div>
        </nav>

        {page === 'skills' ? (
          <SkillsTab skills={skills} setSkills={setSkills} agentConfigs={agentCfgs} setAgentConfigs={setAgentCfgs} agents={AGENTS} />
        ) : page === 'sessions' ? (
          <SessionsTab agents={AGENTS} />
        ) : page === 'memory' ? (
          <MemoryTab agents={AGENTS} project={activeProject} />
        ) : page === 'config' ? (
          <ConfigTab configs={agentCfgs} setConfigs={setAgentCfgs} skills={skills} routing={routing} setRouting={setRouting} budgetSettings={budget} setBudgetSettings={setBudget} agents={AGENTS} user={user} localLLM={localLLM} setLocalLLM={setLocalLLM} timezone={timezone} setTimezone={setTimezone} />
        ) : (
          <>
            <div className="input-section">
              <div className="input-row">
                <textarea className="req-ta" placeholder="Technical requirement... (Ctrl+Enter to deploy all 14 agents)"
                  value={req} onChange={function(e) { setReq(e.target.value) }}
                  onKeyDown={function(e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAll() }} />
                <div className="input-actions">
                  <button className={'run-btn' + (running ? ' running' : '')} onClick={runAll} disabled={running || !req.trim()}>
                    {running ? '◌ ' + doneCount + '/' + workers.length : '▶ Deploy 14'}
                  </button>
                  <div className="quick-info">
                    <div className="qi-row"><span style={{ color: '#00ffcc' }}>✦</span> {skills.filter(function(s) { return s.global }).length} global skills</div>
                    <div className="qi-row"><span style={{ color: '#ff9500' }}>$</span> Cap: ${budget.sessionBudget}</div>
                    {localLLM && localLLM.enabled && <div className="qi-row"><span style={{ color: '#00ffcc' }}>⚡</span> Local LLM {localLLM.quickRoute ? '— ALL agents' : '— active'}</div>}
                  </div>
                </div>
              </div>
              <div className="examples">
                {['Sentinel Vault — core crypto engine','Sentinel Vault — REST API + JWT auth','SENTINEL-AI edge analytics API','Distributed secrets manager CLI'].map(function(ex) {
                  return <button key={ex} className="ex-chip" onClick={function() { setReq(ex) }}>{ex}</button>
                })}
              </div>
            </div>

            <div className="split-screen">
              <div className="split-chat" style={{ width: chatSplit + '%' }}>
                <ChatPanel messages={msgs} agents={AGENTS} onSend={handleUserMsg} isRunning={running} pinnedIds={pinned} onPin={handlePin} onReact={handleReact} filter={chatFilter} setFilter={setChatFilter} />
              </div>
              <div className="split-handle" onMouseDown={function(e) {
                const sx = e.clientX, ss = chatSplit
                function move(ev) { setChatSplit(Math.max(25, Math.min(55, ss + ((ev.clientX - sx) / window.innerWidth) * 100))) }
                function up() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
                window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
              }}><div className="sh-dots">⋮</div></div>
              <div className="split-agents" style={{ width: (100 - chatSplit - 0.5) + '%' }}>
                {!hasRun && <div className="agents-empty"><div className="ae-icon">⬡</div><div className="ae-title">14 Agents Ready</div><div className="ae-sub">Sentinel Vault skill loaded · Deploy to start</div></div>}
                {hasRun && (
                  <>
                    {scrumPlan && (
                      <div className="scrum-strip" style={{ '--sc': planPhase === 'done' ? '#ffffff' : '#ff9500' }}>
                        <div className="ss-hdr-row">
                          <span style={{ color: '#fff', fontSize: 13 }}>⬡</span>
                          <span className="ss-name">Scrum Master <span className="ss-ph">— Sprint Plan</span></span>
                          {planPhase === 'active' && <span className="live-sm">● PLANNING</span>}
                          {planPhase === 'done'   && <span className="done-sm">✓ READY</span>}
                        </div>
                        <div className="ss-preview">{scrumPlan.slice(0, 200)}...</div>
                        <button className="ss-expand" onClick={function() { setModal('__scrum_plan') }}>READ FULL ↗</button>
                      </div>
                    )}
                    <div className="agents-progress">
                      <div className="gp-bar" style={{ flex: 1 }}><div className="gp-fill" style={{ width: totalProg + '%' }} /></div>
                      <span className="gp-ct">{doneCount}/{workers.length}</span>
                    </div>
                    <div className="agent-grid">
                      {workers.map(function(agent) {
                        const st = states[agent.id] || {}
                        return <AgentCard key={agent.id} agent={agent} status={st.status || 'idle'} output={st.output || ''} progress={st.progress || 0} modelKey={st.model || routing[agent.id]} cost={st.cost || 0} onExpand={setModal} />
                      })}
                    </div>
                    {/* Code Executor — shown after session completes */}
                    {hasRun && !running && (
                      <ExecutorPanel
                        agentOutputs={Object.fromEntries(workers.map(function(a) { return [a.id, (states[a.id] && states[a.id].output) || ''] }))}
                        sessionId={sessionId.current}
                        onResult={function(result, files) {
                          setExecResult(result)
                          setExecFiles(files)
                          if (result.success) setShowApproval(true)
                        }}
                      />
                    )}
                    {showApproval && (
                      <button className="run-btn" style={{ margin: '8px 13px', borderColor: '#00ff88', color: '#00ff88' }}
                        onClick={function() { setShowApproval(true) }}>
                        ✓ Review & Commit to GitHub
                      </button>
                    )}
                    {scrumSynth && (
                      <div className="scrum-strip synth" style={{ '--sc': '#00ff88' }}>
                        <div className="ss-hdr-row">
                          <span style={{ color: '#00ff88', fontSize: 13 }}>⬡</span>
                          <span className="ss-name">Scrum Master <span className="ss-ph">— Execution Plan</span></span>
                          {synthPhase === 'active' && <span className="live-sm" style={{ color: '#00ff88' }}>● SYNTHESIZING</span>}
                          {synthPhase === 'done'   && <span className="done-sm" style={{ color: '#00ff88' }}>✓ COMPLETE</span>}
                        </div>
                        <div className="ss-preview">{scrumSynth.slice(0, 200)}...</div>
                        <button className="ss-expand" onClick={function() { setModal('__scrum_synth') }}>READ FULL ↗</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showApproval && (
        <ApprovalGate
          session={{
            id:            sessionId.current,
            requirement:   req,
            files:         execFiles,
            testResult:    execResult && execResult.testSummary,
            commitMessage: 'feat: ' + req.slice(0, 60).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/ +/g, '-'),
            branchName:    'agentpool-' + (sessionId.current || '').slice(0, 6),
          }}
          onApprove={function(data) { setShowApproval(false); addMsg('system', 'complete', '✓ Committed — PR: ' + data.prUrl) }}
          onReject={function()      { setShowApproval(false); addMsg('system', 'warning',  'Commit rejected by user') }}
          onClose={function()       { setShowApproval(false) }}
        />
      )}
      {modal && (
        <div className="modal-ov" onClick={function() { setModal(null) }}>
          <div className="modal" style={{ '--ac': modal.startsWith('__') ? (modal === '__scrum_plan' ? '#ffffff' : '#00ff88') : ((modalAgent && modalAgent.color) || '#00d4ff') }} onClick={function(e) { e.stopPropagation() }}>
            <div className="modal-hdr">
              <div className="modal-title">
                {modal === '__scrum_plan'  && <><span style={{ color: '#fff' }}>⬡</span> Sprint Plan</>}
                {modal === '__scrum_synth' && <><span style={{ color: '#00ff88' }}>⬡</span> Execution Plan</>}
                {!modal.startsWith('__') && modalAgent && <><span style={{ color: modalAgent.color }}>{modalAgent.icon}</span>{modalAgent.name}</>}
              </div>
              <button className="modal-close" onClick={function() { setModal(null) }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="out" style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: md(modal === '__scrum_plan' ? scrumPlan : modal === '__scrum_synth' ? scrumSynth : ((modalState && modalState.output) || '')) }} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@400;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#07090c;--s1:#0c1117;--bd:#1a2530;--t:#b0c8d8;--td:#3a5060;--tb:#e0f0ff;--mono:'JetBrains Mono',monospace;--disp:'Syne',sans-serif}
html,body,#root{height:100%;overflow:hidden}
body{background:var(--bg);color:var(--t);font-family:var(--mono);font-size:13px;line-height:1.6}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,212,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.012) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0}
.app{position:relative;z-index:1;height:100vh;display:flex;flex-direction:column;overflow:hidden}
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
.sv{font-family:var(--disp);font-size:14px;font-weight:700}
.sl{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1.5px}
.nav-user{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--t);border-left:1px solid var(--bd);padding-left:14px}
.nav-role{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1px;border:1px solid var(--bd);padding:1px 5px}
.logout-btn{background:transparent;border:1px solid var(--bd);color:var(--td);font-size:11px;padding:3px 8px;cursor:pointer;transition:all .15s}
.logout-btn:hover{border-color:#ff4560;color:#ff4560}
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
.split-screen{display:flex;flex:1;overflow:hidden;min-height:0}
.split-chat{display:flex;flex-direction:column;border-right:1px solid var(--bd);overflow:hidden;flex-shrink:0}
.split-handle{width:5px;background:var(--bd);cursor:col-resize;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;user-select:none}
.split-handle:hover{background:#00d4ff}
.sh-dots{color:var(--td);font-size:14px;writing-mode:vertical-rl;letter-spacing:-2px;pointer-events:none}
.split-agents{display:flex;flex-direction:column;overflow-y:auto;flex:1;min-width:0;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
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
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.modal{background:var(--s1);border:1px solid var(--bd);border-top:2px solid var(--ac);width:100%;max-width:800px;max-height:88vh;display:flex;flex-direction:column}
.modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--bd);flex-shrink:0;gap:8px}
.modal-title{font-family:var(--disp);font-size:13px;font-weight:700;color:var(--tb);display:flex;align-items:center;gap:7px}
.modal-close{background:transparent;border:1px solid var(--bd);color:var(--td);font-size:12px;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.modal-close:hover{border-color:#ff4560;color:#ff4560}
.modal-body{flex:1;overflow-y:auto;padding:16px;scrollbar-width:thin;scrollbar-color:var(--bd) transparent}
.executor-panel{background:var(--s1);border:1px solid var(--bd);border-top:2px solid #00ffcc;padding:13px;margin:1px 0}
.ep-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--bd)}
.ep-files{display:flex;flex-direction:column;gap:0}
.ep-results{margin-top:10px;display:flex;flex-direction:column;gap:8px}
.ep-step{background:var(--bg);border:1px solid var(--bd);padding:8px 10px}
.ep-test-summary{background:var(--bg);border:1px solid var(--bd);padding:10px;border-left:2px solid #00ff88}
.ag-section-title{font-size:8px;color:var(--td);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
.ag-tests{display:flex;flex-direction:column;gap:2px}
.ag-test-summary{display:flex;gap:12px;font-size:10px;margin-bottom:6px;font-weight:700}
.ag-test-row{display:flex;align-items:center;gap:6px;padding:2px 0;font-size:9px}
.ag-test-name{flex:1;font-family:var(--mono)}
.ag-files{display:flex;flex-direction:column;gap:3px}
.ag-file-row{display:flex;align-items:center;gap:6px;font-size:10px;font-family:var(--mono)}
.ag-file-path{flex:1;color:var(--tb)}
.ag-approve-btn{background:#00ff88;border:none;color:var(--bg);font-family:var(--disp);font-weight:700;font-size:11px;padding:9px 18px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;transition:all .2s}
.ag-approve-btn:disabled{opacity:.35;cursor:not-allowed}
.ag-reject-btn{background:transparent;border:1.5px solid #ff4560;color:#ff4560;font-family:var(--disp);font-weight:700;font-size:11px;padding:9px 18px;cursor:pointer;letter-spacing:1px}
.ag-reject-btn:hover{background:#ff4560;color:var(--bg)}
.ag-pr-link{color:#00d4ff;font-size:11px;text-decoration:none;border:1px solid #00d4ff;padding:6px 12px;display:inline-block}
.ag-pr-link:hover{background:#00d4ff;color:var(--bg)}
.approval-modal{border-top-color:#00ff88}
.autofixer{background:var(--s1);border:1px solid rgba(255,149,0,.3);border-left:2px solid #ff9500;padding:12px;margin-top:8px}
.af-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;gap:10px}
.af-title{font-family:var(--disp);font-size:12px;font-weight:700;color:#ff9500}
.af-sub{font-size:9px;color:var(--td);margin-top:2px}
.af-log{display:flex;flex-direction:column;gap:2px;padding:6px 8px;background:var(--bg);border:1px solid var(--bd);max-height:100px;overflow-y:auto}
`
