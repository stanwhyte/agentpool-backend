// src/ExecutorPanel.jsx
// Code execution panel — compile, test, show results
import { useState } from 'react'
import { getToken } from './api.js'

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.safecitysentinel.com'

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }
}

function TestRow({ test }) {
  const color = test.status === 'pass' ? '#00ff88' : test.status === 'fail' ? '#ff4560' : '#ff9500'
  const icon  = test.status === 'pass' ? '✓' : test.status === 'fail' ? '✗' : '–'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 10 }}>
      <span style={{ color, fontWeight: 700, width: 12 }}>{icon}</span>
      <span style={{ color: 'var(--t)', flex: 1 }}>{test.name}</span>
      <span style={{ color: 'var(--td)', fontSize: 9 }}>{test.duration}</span>
    </div>
  )
}

export default function ExecutorPanel({ agentOutputs, sessionId, onResult }) {
  const [running,    setRunning]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState('')
  const [step,       setStep]       = useState('')
  const [dockerOk,   setDockerOk]   = useState(null)
  const [language,   setLanguage]   = useState('go')
  const [retryCount, setRetryCount] = useState(0)

  // Extract files from agent outputs
  function extractFiles(outputs) {
    const files = []
    Object.entries(outputs || {}).forEach(function(entry) {
      const agentId = entry[0]
      const output  = entry[1]
      if (!output) return
      // Extract code blocks with file paths
      const matches = [...output.matchAll(/```(?:go|golang)\s*\n(?:\/\/ ([^\n]+\.go)\n)?([\s\S]*?)```/g)]
      matches.forEach(function(m) {
        const path    = m[1] || (agentId === 'codegen' ? 'main.go' : agentId + '.go')
        const content = m[2]
        if (content && content.trim().length > 20) {
          // Deduplicate by path
          const existing = files.findIndex(function(f) { return f.path === path })
          if (existing >= 0) files[existing] = { path, content, agentId }
          else files.push({ path, content, agentId })
        }
      })
    })
    return files
  }

  async function checkDocker() {
    try {
      const res  = await fetch(API_BASE + '/api/execute/status', { headers: authHeaders() })
      const data = await res.json()
      setDockerOk(data.available)
      return data.available
    } catch(e) { setDockerOk(false); return false }
  }

  async function runExecution(filesToRun, retries) {
    setRunning(true)
    setResult(null)
    setError('')
    setRetryCount(retries || 0)

    // Check Docker first
    setStep('Checking Docker sandbox...')
    const dockerAvailable = await checkDocker()
    if (!dockerAvailable) {
      setError('Docker not available on server. Install with: apt-get install docker.io')
      setRunning(false)
      return
    }

    setStep('Starting sandbox container...')
    try {
      const res  = await fetch(API_BASE + '/api/execute', {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ language, files: filesToRun, sessionId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Execution failed')

      setResult(data)
      setStep(data.success ? '✓ All tests passing' : '✗ Tests failed')
      onResult && onResult(data, filesToRun)
    } catch(e) {
      setError(e.message)
      setStep('Failed')
    }
    setRunning(false)
  }

  const files = extractFiles(agentOutputs)

  return (
    <div className="executor-panel">
      <div className="ep-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#00ffcc', fontSize: 16 }}>⚡</span>
          <div>
            <div style={{ fontFamily: 'var(--disp)', fontSize: 12, fontWeight: 700, color: 'var(--tb)' }}>Code Executor</div>
            <div style={{ fontSize: 9, color: 'var(--td)' }}>Docker sandbox · isolated · no network</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select className="rc-select" style={{ width: 120 }} value={language} onChange={function(e) { setLanguage(e.target.value) }}>
            <option value="go">Go</option>
            <option value="python">Python</option>
            <option value="node">Node.js</option>
          </select>
          {dockerOk !== null && (
            <span style={{ fontSize: 9, color: dockerOk ? '#00ff88' : '#ff4560' }}>
              {dockerOk ? '● Docker ready' : '✗ Docker unavailable'}
            </span>
          )}
        </div>
      </div>

      {/* Files extracted from agents */}
      <div className="ep-files">
        <div style={{ fontSize: 9, color: 'var(--td)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          Files extracted from agents ({files.length})
        </div>
        {files.length === 0 && (
          <div style={{ color: 'var(--td)', fontSize: 10, padding: '8px 0' }}>
            No code files found in agent outputs. Run agents first, then execute.
          </div>
        )}
        {files.map(function(f, i) {
          const lines = f.content.split('\n').length
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 10 }}>
              <span style={{ color: '#00ff88' }}>+</span>
              <span style={{ color: 'var(--tb)', fontFamily: 'var(--mono)', flex: 1 }}>{f.path}</span>
              <span style={{ color: 'var(--td)', fontSize: 9 }}>{lines}L</span>
              <span style={{ fontSize: 7, color: 'var(--td)', border: '1px solid var(--bd)', padding: '0 4px' }}>from {f.agentId}</span>
            </div>
          )
        })}
      </div>

      {/* Run button */}
      <button
        className={'run-btn' + (running ? ' running' : '')}
        style={{ width: '100%', marginTop: 10 }}
        onClick={function() { runExecution(files) }}
        disabled={running || files.length === 0}
      >
        {running ? '◌ ' + step : '▶ Run in Docker Sandbox'}
      </button>

      {retryCount > 0 && (
        <div style={{ fontSize: 9, color: '#ff9500', marginTop: 4 }}>Retry attempt {retryCount}/3</div>
      )}

      {error && (
        <div style={{ color: '#ff4560', fontSize: 10, marginTop: 8, padding: '6px 8px', border: '1px solid rgba(255,69,96,.3)', background: 'rgba(255,69,96,.05)' }}>
          ⚠ {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="ep-results">
          {result.steps && result.steps.map(function(step, i) {
            const isOk = step.exitCode === 0
            return (
              <div key={i} className="ep-step">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: isOk ? '#00ff88' : '#ff4560', fontWeight: 700 }}>{isOk ? '✓' : '✗'}</span>
                  <span style={{ fontFamily: 'var(--disp)', fontSize: 10, color: 'var(--tb)', textTransform: 'uppercase' }}>{step.step}</span>
                  <span style={{ fontSize: 9, color: 'var(--td)', marginLeft: 'auto' }}>{step.duration}ms</span>
                </div>
                {step.stderr && !isOk && (
                  <pre style={{ fontSize: 9, color: '#ff4560', background: 'var(--bg)', padding: '6px 8px', overflow: 'auto', maxHeight: 200, border: '1px solid rgba(255,69,96,.2)' }}>
                    {step.stderr.slice(0, 2000)}
                  </pre>
                )}
                {step.stdout && (
                  <pre style={{ fontSize: 9, color: 'var(--t)', background: 'var(--bg)', padding: '6px 8px', overflow: 'auto', maxHeight: 200, border: '1px solid var(--bd)' }}>
                    {step.stdout.slice(0, 3000)}
                  </pre>
                )}
              </div>
            )
          })}

          {result.testSummary && (
            <div className="ep-test-summary">
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11 }}>
                <span style={{ color: '#00ff88', fontWeight: 700 }}>✓ {result.testSummary.passed} passed</span>
                {result.testSummary.failed > 0 && <span style={{ color: '#ff4560', fontWeight: 700 }}>✗ {result.testSummary.failed} failed</span>}
                {result.testSummary.coverage !== null && <span style={{ color: '#00d4ff' }}>{result.testSummary.coverage}% coverage</span>}
              </div>
              {result.testSummary.tests && result.testSummary.tests.map(function(t, i) { return <TestRow key={i} test={t} /> })}
            </div>
          )}

          {result.success && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,255,136,.05)', border: '1px solid rgba(0,255,136,.2)', fontSize: 10, color: '#00ff88' }}>
              ✓ All tests passing — ready for human approval
            </div>
          )}
        </div>
      )}
    </div>
  )
}
