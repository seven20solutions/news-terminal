#!/usr/bin/env node
// Minimal TTS proxy using OpenAI TTS — no dependencies
// Usage: OPENAI_API_KEY=sk-... node server/tts-server.js

import http from 'http';
import { URL } from 'url';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8006;
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI || null;

if (!OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY environment variable.');
  console.error('Set OPENAI_API_KEY and rerun: OPENAI_API_KEY=sk-... node server/tts-server.js');
  process.exitCode = 1;
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

async function proxyTts(text, voice) {
  const payload = {
    model: 'gpt-4o-mini-tts',
    voice: voice || 'alloy',
    input: text,
  };

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`OpenAI TTS error (${res.status}): ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/api/tts') {
    try {
      const body = await parseJsonBody(req);
      const text = (body && body.text) || '';
      const voice = body.voice;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing text in request body' }));
        return;
      }

      const openaiRes = await proxyTts(text, voice);

      // Read OpenAI audio response fully and send as a Buffer to ensure
      // we don't accidentally forward a non-audio stream or a web Readable
      // that becomes corrupted when piped to the Node http response.
      const arrayBuffer = await openaiRes.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Content-Length': String(audioBuffer.length),
      });
      res.end(audioBuffer);
    } catch (err) {
      console.error('TTS proxy error', err);
      const status = err.status || 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err.message || err) }));
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
