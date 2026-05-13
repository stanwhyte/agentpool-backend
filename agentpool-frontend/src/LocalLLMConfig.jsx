// src/LocalLLMConfig.jsx
// Ollama / local LLM configuration panel
import { useState } from 'react'

export default function LocalLLMConfig({ localLLM, setLocalLLM }) {
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState('')

  const PRESETS = [
    { label: 'Ollama (local)',         endpoint: 'http://localhost:11434', note: 'Default Ollama port' },
    { label: 'LM Studio',              endpoint: 'http://localhost:1234',  note: 'LM Studio server' },
    { label: 'Ollama (remote DO)',      endpoint: 'http://165.245.210.144:11434', note: 'DigitalOcean droplet' },
    { label: 'Custom endpoint',        endpoint: '',                       note: 'Enter manually' },
  ]

  const SUGGESTED_MODELS = [
    { id: 'ollama/llama3.2',       label: 'Llama 3.2 3B',      note: 'Fast, good for most tasks' },
    { id: 'ollama/llama3.1',       label: 'Llama 3.1 8B',      note: 'Better quality, slower' },
    { id: 'ollama/codellama',      label: 'CodeLlama 7B',      note: 'Best for CodeGen agent' },
    { id: 'ollama/deepseek-coder', label: 'DeepSeek Coder 6.7B', note: 'Excellent for code tasks' },
    { id: 'ollama/qwen2.5-coder',  label: 'Qwen2.5 Coder 7B', note: 'Top-tier code model' },
    { id: 'ollama/mistral',        label: 'Mistral 7B',        note: 'Fast general purpose' },
  ]

  async function testConnection() {
    setTesting(true)
    setTestResult('')
    try {
      const endpoint = localLLM.endpoint || 'http://localhost:11434'
      const res = await fetch(endpoint + '/api/tags', { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json()
        const models = (data.models || []).map(function(m) { return m.name }).join(', ')
        setTestResult('✓ Connected — models: ' + (models || 'none pulled yet'))
      } else {
        setTestResult('⚠ Connected but got status ' + res.status)
      }
    } catch(e) {
      setTestResult('✗ Cannot connect — is Ollama running? Try: ollama serve')
    }
    setTesting(false)
  }

  function update(field, value) {
    setLocalLLM(function(p) { return Object.assign({}, p, { [field]: value }) })
  }

  return (
    <div className="llm-config">
      <div className="llm-header">
        <div className="llm-title">⚡ Local LLM</div>
        <div className="llm-sub">Route agents to locally hosted models — zero API cost</div>
        <div className={'toggle' + (localLLM.enabled ? ' on' : '')}
          style={localLLM.enabled ? { '--tc': '#00ffcc' } : {}}
          onClick={function() { update('enabled', !localLLM.enabled) }}>
          <div className="tknob" />
        </div>
      </div>

      {localLLM.enabled && (
        <>
          <div className="llm-section">
            <div className="llm-sect-title">Endpoint</div>
            <div className="llm-presets">
              {PRESETS.map(function(p) {
                return (
                  <button key={p.label}
                    className={'llm-preset' + (localLLM.endpoint === p.endpoint ? ' active' : '')}
                    onClick={function() { if (p.endpoint) update('endpoint', p.endpoint) }}>
                    <div className="llm-preset-label">{p.label}</div>
                    <div className="llm-preset-note">{p.note}</div>
                  </button>
                )
              })}
            </div>
            <div className="sg-input-row" style={{ marginTop: 8 }}>
              <input className="sg-input" placeholder="http://localhost:11434"
                value={localLLM.endpoint || ''}
                onChange={function(e) { update('endpoint', e.target.value) }} />
              <button className="fetch-btn" onClick={testConnection} disabled={testing}>
                {testing ? '◌' : 'TEST'}
              </button>
            </div>
            {testResult && (
              <div className="llm-test-result" style={{ color: testResult.startsWith('✓') ? '#00ffcc' : testResult.startsWith('⚠') ? '#ff9500' : '#ff4560' }}>
                {testResult}
              </div>
            )}
          </div>

          <div className="llm-section">
            <div className="llm-sect-title">Available Local Models</div>
            <div className="llm-models">
              {SUGGESTED_MODELS.map(function(m) {
                return (
                  <div key={m.id} className="llm-model">
                    <div className="llm-model-info">
                      <div className="llm-model-name">{m.label}</div>
                      <div className="llm-model-note">{m.note}</div>
                    </div>
                    <code className="llm-model-id">{m.id.replace('ollama/', '')}</code>
                  </div>
                )
              })}
            </div>
            <div className="llm-pull-hint">
              Pull models with: <code className="ic">ollama pull llama3.2</code>
            </div>
          </div>

          <div className="llm-section">
            <div className="llm-sect-title">Fallback Behaviour</div>
            <div className="sg-toggle-field" style={{ marginTop: 6 }}>
              <div>
                <label className="sg-label">Fall back to cloud if local fails</label>
                <div className="sg-hint">Use configured cloud model if Ollama is unreachable</div>
              </div>
              <div className={'toggle' + (localLLM.fallback ? ' on' : '')}
                onClick={function() { update('fallback', !localLLM.fallback) }}>
                <div className="tknob" />
              </div>
            </div>
          </div>

          <div className="llm-section">
            <div className="llm-sect-title">Quick Route All Agents to Local</div>
            <div className="llm-quick-btns">
              {[
                { label: 'All → Llama 3.2', model: 'ollama/llama3.2' },
                { label: 'All → CodeLlama', model: 'ollama/codellama' },
                { label: 'All → Mistral',   model: 'ollama/mistral'   },
                { label: 'All → Groq (free cloud)', model: 'llama-3.3-70b-versatile' },
              ].map(function(btn) {
                return (
                  <button key={btn.label} className="llm-quick-btn"
                    onClick={function() { update('quickRoute', btn.model) }}>
                    {btn.label}
                  </button>
                )
              })}
            </div>
            <div className="sg-hint" style={{ marginTop: 6 }}>Go to Model Routing tab to set per-agent</div>
          </div>
        </>
      )}
    </div>
  )
}
