// src/AutoFixer.jsx
// Autonomous code fixer — takes compile/test errors and fixes code via Claude
import { useState } from 'react'
import { getToken } from './api.js'

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.safecitysentinel.com'

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }
}

const FIXER_SYSTEM = `You are an expert Go engineer. You will be given:
1. Go source files that failed to compile or test
2. The exact error messages

Your job: fix the code. Rules:
- Return ONLY the fixed files as code blocks
- Each file must start with: // filename.go
- Every file must have a valid package declaration as the first non-comment line
- Fix ALL errors shown, not just the first one
- Do not add explanations — only return fixed code blocks
- Preserve all existing logic, only fix what is broken
- If a file is not relevant to the error, still include it unchanged`

export default function AutoFixer({ files, errorOutput, onFixed, sessionId }) {
  const [fixing,   setFixing]   = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [log,      setLog]      = useState([])
  const MAX_ATTEMPTS = 3

  function addLog(msg) {
    setLog(function(p) { return [...p, { ts: new Date().toLocaleTimeString(), msg }] })
  }

  function extractFixedFiles(text) {
    const fixed = []
    const matches = [...text.matchAll(/```(?:go|golang)[^\n]*\n([\s\S]*?)```/g)]
    matches.forEach(function(m) {
      const content = m[1]
      if (!content || content.trim().length < 10) return
      // Get filename from first comment line
      const commentMatch = content.match(/^\/\/ ([a-zA-Z0-9_/]+\.go)\n/)
      if (!commentMatch) return
      const path = commentMatch[1]
      // Validate it's real Go
      const lines = content.trim().split('\n')
      const firstCode = lines.find(function(l) {
        const t = l.trim()
        return t.length > 0 && !t.startsWith('//') && !t.startsWith('/*')
      }) || ''
      if (!firstCode.startsWith('package ')) {
        console.log('AutoFixer: skipping invalid file', path)
        return
      }
      fixed.push({ path, content, agentId: 'autofixer' })
    })
    return fixed
  }

  async function runFix() {
    if (fixing || attempts >= MAX_ATTEMPTS) return
    setFixing(true)
    const attempt = attempts + 1
    setAttempts(attempt)
    addLog('Attempt ' + attempt + '/' + MAX_ATTEMPTS + ' — sending to Claude...')

    const fileList = files.map(function(f) {
      return '// ' + f.path + '\n```go\n// ' + f.path + '\n' + f.content + '\n```'
    }).join('\n\n')

    const prompt = 'Fix these Go files:\n\n' + fileList + '\n\nErrors:\n```\n' + errorOutput + '\n```'

    try {
      const res = await fetch(API_BASE + '/api/agent', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          model:     'claude-sonnet-4-20250514',
          system:    FIXER_SYSTEM,
          messages:  [{ role: 'user', content: prompt }],
          agentId:   'autofixer',
          sessionId: sessionId,
        })
      })

      if (!res.ok) throw new Error('API error ' + res.status)

      const reader  = res.body.getReader()
      const dec     = new TextDecoder()
      let   buf     = ''
      let   fullOut = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6).trim()
          if (d === '[DONE]') break
          try {
            const parsed = JSON.parse(d)
            if (parsed.text) fullOut += parsed.text
          } catch(e) {}
        }
      }

      addLog('Response received — extracting fixed files...')
      const fixedFiles = extractFixedFiles(fullOut)

      if (fixedFiles.length === 0) {
        addLog('⚠ No valid Go files extracted from response')
        setFixing(false)
        return
      }

      addLog('✓ ' + fixedFiles.length + ' files fixed — re-running sandbox...')
      onFixed && onFixed(fixedFiles, attempt)

    } catch(e) {
      addLog('✗ Error: ' + e.message)
    }
    setFixing(false)
  }

  if (!errorOutput || !files || files.length === 0) return null

  return (
    <div className="autofixer">
      <div className="af-header">
        <div>
          <div className="af-title">🔧 AutoFixer</div>
          <div className="af-sub">AI-powered error correction · max {MAX_ATTEMPTS} attempts</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {attempts > 0 && <span style={{ fontSize: 9, color: 'var(--td)' }}>Attempt {attempts}/{MAX_ATTEMPTS}</span>}
          <button
            className={'run-btn' + (fixing ? ' running' : '')}
            style={{ padding: '6px 14px', fontSize: 10 }}
            onClick={runFix}
            disabled={fixing || attempts >= MAX_ATTEMPTS}
          >
            {fixing ? '◌ Fixing...' : attempts === 0 ? '🔧 Auto-Fix Errors' : '🔧 Retry Fix'}
          </button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="af-log">
          {log.map(function(entry, i) {
            return (
              <div key={i} style={{ fontSize: 9, color: entry.msg.startsWith('✓') ? '#00ff88' : entry.msg.startsWith('✗') ? '#ff4560' : 'var(--td)' }}>
                <span style={{ color: 'var(--td)', marginRight: 6 }}>{entry.ts}</span>
                {entry.msg}
              </div>
            )
          })}
        </div>
      )}

      {attempts >= MAX_ATTEMPTS && (
        <div style={{ fontSize: 10, color: '#ff9500', padding: '6px 8px', border: '1px solid rgba(255,149,0,.3)', marginTop: 6 }}>
          ⚠ Max attempts reached. Review errors manually or re-run agents with more specific requirements.
        </div>
      )}
    </div>
  )
}
