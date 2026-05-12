// src/Login.jsx
import { useState } from 'react';
import { login } from './api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true); setError('');
    try {
      const data = await login(username, password);
      onLogin(data.user);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">⬡</div>
        <div className="login-title">AGENT<span>POOL</span></div>
        <div className="login-sub">SENTINEL-AI · Development Platform</div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="lf-field">
            <label className="lf-label">Username</label>
            <input className="lf-input" type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your username" autoFocus autoComplete="username"/>
          </div>
          <div className="lf-field">
            <label className="lf-label">Password</label>
            <input className="lf-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••" autoComplete="current-password"/>
          </div>
          {error && <div className="lf-error">⚠ {error}</div>}
          <button className="lf-btn" type="submit" disabled={loading || !username || !password}>
            {loading ? '◌ Signing in...' : '→ Sign In'}
          </button>
        </form>
        <div className="login-footer">
          AgentPool v1.0 · safecitysentinel.com
        </div>
      </div>
    </div>
  );
}
