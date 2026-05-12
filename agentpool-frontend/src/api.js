const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

let _token = localStorage.getItem('agentpool_token')
let _user  = JSON.parse(localStorage.getItem('agentpool_user') || 'null')

export function getToken()   { return _token }
export function getUser()    { return _user }
export function isLoggedIn() { return !!_token }

export async function login(username, password) {
  const res  = await fetch(API_BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  _token = data.token
  _user  = data.user
  localStorage.setItem('agentpool_token', _token)
  localStorage.setItem('agentpool_user',  JSON.stringify(_user))
  return data
}

export function logout() {
  _token = null; _user = null
  localStorage.removeItem('agentpool_token')
  localStorage.removeItem('agentpool_user')
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token }
}

export async function streamAgent({ model, system, messages, agentId, sessionId, onChunk, signal }) {
  const res = await fetch(API_BASE + '/api/agent', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ model, system, messages, agentId, sessionId }), signal
  })
  if (res.status === 401) { logout(); throw new Error('Session expired — please log in again') }
  if (res.status === 402) { const d = await res.json(); throw new Error(d.error) }
  if (!res.ok) { const d = await res.json().catch(function() { return {} }); throw new Error(d.error || 'HTTP ' + res.status) }
  const reader = res.body.getReader()
  const dec    = new TextDecoder()
  let   buf    = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const d = line.slice(6).trim()
      if (d === '[DONE]') return
      try {
        const p = JSON.parse(d)
        if (p.text)  onChunk(p.text)
        if (p.error) throw new Error(p.error)
      } catch(e) { if (e.message !== 'Unexpected token') throw e }
    }
  }
}

export async function getBudget() {
  const res = await fetch(API_BASE + '/api/agent/budget', { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch budget')
  return res.json()
}

export async function fetchRepoReadme(owner, repo) {
  const res = await fetch(API_BASE + '/api/github/repo/' + owner + '/' + repo + '/readme', { headers: authHeaders() })
  if (!res.ok) throw new Error('GitHub ' + res.status)
  return res.json()
}

export async function fetchRepoTree(owner, repo) {
  const res = await fetch(API_BASE + '/api/github/repo/' + owner + '/' + repo + '/tree', { headers: authHeaders() })
  if (!res.ok) throw new Error('GitHub ' + res.status)
  return res.json()
}

export async function sendNotification(event, payload) {
  const res = await fetch(API_BASE + '/api/notify', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ event, payload })
  })
  return res.json()
}

export async function createUser(username, password, role) {
  const res = await fetch(API_BASE + '/api/auth/users', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ username, password, role })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data
}

// ── Skills persistence ────────────────────────────────────────────────────────
export async function loadSkills() {
  try {
    const res = await fetch(API_BASE + '/api/skills', { headers: authHeaders() })
    if (!res.ok) return null
    const data = await res.json()
    return data.skills
  } catch(e) { return null }
}

export async function saveSkills(skills) {
  try {
    await fetch(API_BASE + '/api/skills', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ skills })
    })
  } catch(e) { /* silent — localStorage is fallback */ }
}

// ── Settings persistence ──────────────────────────────────────────────────────
export async function loadSettings() {
  try {
    const res = await fetch(API_BASE + '/api/settings', { headers: authHeaders() })
    if (!res.ok) return null
    const data = await res.json()
    return data.settings
  } catch(e) { return null }
}

export async function saveSettings(routing, budgetSettings, agentConfigs) {
  try {
    await fetch(API_BASE + '/api/settings', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ routing, budgetSettings, agentConfigs })
    })
  } catch(e) { /* silent */ }
}
