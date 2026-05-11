// src/providers/index.js
// Unified streaming interface for all 5 AI providers
// Each provider normalizes to the same onChunk(text) callback pattern

import logger from '../utils/logger.js';

// ── Provider configs ──────────────────────────────────────────────────────────
function getProviderConfig(model) {
  if (model.startsWith('claude')) {
    return {
      name: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      buildBody: (model, system, messages, maxTokens) => ({
        model,
        max_tokens: maxTokens,
        stream: true,
        system,
        messages,
      }),
      extractChunk: (parsed) => parsed?.delta?.text || '',
    };
  }

  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) {
    return {
      name: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      buildBody: (model, system, messages, maxTokens) => ({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
      extractChunk: (parsed) => parsed?.choices?.[0]?.delta?.content || '',
    };
  }

  if (model.startsWith('gemini')) {
    // Google uses a different API shape — non-streaming for simplicity,
    // converted to pseudo-stream via chunked response
    return {
      name: 'google',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${process.env.GOOGLE_API_KEY}&alt=sse`,
      headers: {},
      buildBody: (model, system, messages, maxTokens) => ({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      extractChunk: (parsed) =>
        parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '',
    };
  }

  if (model.includes('sonar') || model.includes('pplx') || model.startsWith('llama-3.1-sonar')) {
    return {
      name: 'perplexity',
      url: 'https://api.perplexity.ai/chat/completions',
      headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      buildBody: (model, system, messages, maxTokens) => ({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
      extractChunk: (parsed) => parsed?.choices?.[0]?.delta?.content || '',
    };
  }

  if (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')) {
    return {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      buildBody: (model, system, messages, maxTokens) => ({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
      extractChunk: (parsed) => parsed?.choices?.[0]?.delta?.content || '',
    };
  }

  throw new Error(`Unknown model: ${model}. Cannot determine provider.`);
}

// ── Validate key exists before making request ─────────────────────────────────
function validateKey(providerName) {
  const keyMap = {
    anthropic:  process.env.ANTHROPIC_API_KEY,
    openai:     process.env.OPENAI_API_KEY,
    google:     process.env.GOOGLE_API_KEY,
    perplexity: process.env.PERPLEXITY_API_KEY,
    groq:       process.env.GROQ_API_KEY,
  };
  const key = keyMap[providerName];
  if (!key || key.includes('REPLACE_ME')) {
    throw new Error(`${providerName.toUpperCase()}_API_KEY not configured. Add it to /etc/agentpool/.env`);
  }
}

// ── Main streaming function ───────────────────────────────────────────────────
export async function streamProvider({ model, system, messages, maxTokens = 1000, onChunk, onDone, signal }) {
  const cfg = getProviderConfig(model);
  validateKey(cfg.name);

  const body = cfg.buildBody(model, system, messages, maxTokens);

  logger.debug('provider_request', { provider: cfg.name, model, messageCount: messages.length });

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cfg.headers },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown error');
    logger.error('provider_error', { provider: cfg.name, model, status: res.status, error: errorText });
    throw new Error(`${cfg.name} API error ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let totalChars = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          onDone?.({ totalChars });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text = cfg.extractChunk(parsed);
          if (text) {
            totalChars += text.length;
            onChunk(text);
          }
        } catch {}
      }
    }
    onDone?.({ totalChars });
  } finally {
    reader.releaseLock();
  }
}

// ── Non-streaming (for GitHub, notifications, etc.) ───────────────────────────
export async function completeProvider({ model, system, prompt, maxTokens = 500 }) {
  const cfg = getProviderConfig(model);
  validateKey(cfg.name);

  const body = cfg.buildBody(model, system, [{ role: 'user', content: prompt }], maxTokens);

  const res = await fetch(cfg.url.replace('stream=true', ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cfg.headers },
    body: JSON.stringify({ ...body, stream: false }),
  });

  if (!res.ok) throw new Error(`${cfg.name} API error ${res.status}`);
  const data = await res.json();

  // Normalize response across providers
  return (
    data?.content?.[0]?.text ||           // Anthropic
    data?.choices?.[0]?.message?.content || // OpenAI/Groq/Perplexity
    data?.candidates?.[0]?.content?.parts?.[0]?.text || // Google
    ''
  );
}

export { getProviderConfig };
