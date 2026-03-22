#!/usr/bin/env node
// Minimal TTS proxy using OpenAI TTS — no dependencies
// Usage: OPENAI_API_KEY=sk-... node server/tts-server.js

import http from 'http';
import { URL } from 'url';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8006;
const ENV_OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI || null;

if (!ENV_OPENAI_KEY) {
  // Do not exit: allow per-request keys from clients. Warn about missing env var but keep server running.
  console.warn('Warning: OPENAI_API_KEY environment variable is not set. Server will accept per-request keys.');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function proxyTts(text, voice, perRequestKey) {
  const payload = {
    model: 'gpt-4o-mini-tts',
    voice: voice || 'alloy',
    input: text,
  };

  // Choose key: per-request if provided & valid, else env fallback
  let keyToUse = null;
  if (perRequestKey && typeof perRequestKey === 'string') {
    // Basic validation: prefer keys that start with sk- but accept any non-empty string
    const cleaned = perRequestKey.trim();
    if (!cleaned) {
      const err = new Error('Provided openaiKey is empty');
      err.status = 400;
      throw err;
    }
    if (!cleaned.startsWith('sk-')) {
      // Accept but warn; require at least non-empty
      // do not log the key itself
      console.warn('Using per-request OpenAI key that does not start with sk-');
    }
    keyToUse = cleaned;
  } else if (ENV_OPENAI_KEY) {
    keyToUse = ENV_OPENAI_KEY;
  }

  if (!keyToUse) {
    const err = new Error('No OpenAI API key available (provide OPENAI_API_KEY env or openaiKey in request)');
    err.status = 400;
    throw err;
  }

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${keyToUse}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(payload),
  });

  // If non-200 from OpenAI, propagate status and body to client without logging key
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || 'text/plain';
    const body = await res.arrayBuffer();
    const buffer = Buffer.from(body);
    const err = new Error('OpenAI provider returned error');
    err.status = res.status;
    err.providerResponse = { status: res.status, headers: { 'content-type': contentType }, bodyBuffer: buffer };
    throw err;
  }
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS: only allow same-origin and localhost origins to reduce exposure
  const origin = req.headers.origin;
  const serverOrigin = `http://${req.headers.host}`;
  if (origin && (origin === serverOrigin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('https://localhost') || origin.startsWith('https://127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/api/tts') {
    try {
      const body = await parseJsonBody(req);
      // Do not log body content (may contain keys)
      const text = (body && body.text) || '';
      const voice = body && body.voice;
      const perRequestKey = body && body.openaiKey;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing text in request body' }));
        return;
      }
      try {
        const openaiRes = await proxyTts(text, voice, perRequestKey);
        // Read OpenAI audio response fully and send as a Buffer
        const arrayBuffer = await openaiRes.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-store',
          'Content-Length': String(audioBuffer.length),
        });
        res.end(audioBuffer);
      } catch (provErr) {
        // Provider-level error: if we attached providerResponse, forward it
        if (provErr && provErr.providerResponse) {
          const pr = provErr.providerResponse;
          const headers = { 'Content-Type': pr.headers['content-type'] || 'application/octet-stream' };
          res.writeHead(pr.status || 502, headers);
          return res.end(pr.bodyBuffer);
        }
        throw provErr;
      }
    } catch (err) {
      // Avoid printing sensitive request content; only log safe diagnostics
      console.error('TTS proxy error', err && err.message ? err.message : err);
      const status = err.status || 500;
      const payload = { error: String(err.message || err) };
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    }
    return;
  }

  // fallback for root
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`TTS proxy listening on http://localhost:${PORT}/api/tts`);
});
