// One server function for the whole kit.
// GET  -> the models the page may offer (from _prompts.js).
// POST { mode: "module1", input, model } -> extracts decisions, applies the rule checks, writes the all-hands text.
// The instructions, models and prices live in _prompts.js; any "system" field from the browser is ignored.
// The key comes from the Vercel environment variable ANTHROPIC_API_KEY and never reaches the browser.

import { applyRules, allHandsItems, leakedWords } from './_rules.js';
import { prompts, fields, EXTRACT_MODELS, DEFAULT_EXTRACT_MODEL, EXTRACT_EFFORT, PRICES } from './_prompts.js';

const MAX_INPUT = 12000;
const RATE_LIMIT = 20, RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map(); // ip -> request times; kept in memory, so it is per server instance

// Simple per-IP limit: 20 requests per 10 minutes.
function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return recent.length > RATE_LIMIT;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    return res.status(200).json({
      extract_models: Object.entries(EXTRACT_MODELS).map(([id, m]) => ({ id, label: m.label })),
      default_model: DEFAULT_EXTRACT_MODEL
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (tooMany(ip)) return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });

  // Only Module 1 is public. The browser sends a transcript and may pick a model from the allowlist.
  const { mode = 'module1', input = '', model } = req.body || {};
  if (mode !== 'module1') return res.status(400).json({ error: 'Unknown mode' });
  if (typeof input !== 'string' || !input.trim()) return res.status(400).json({ error: 'No transcript received' });
  if (input.length > MAX_INPUT) return res.status(400).json({ error: `Transcript too long (max ${MAX_INPUT} characters)` });
  const useModel = model || DEFAULT_EXTRACT_MODEL;
  if (typeof useModel !== 'string' || !Object.hasOwn(EXTRACT_MODELS, useModel)) return res.status(400).json({ error: 'Unknown model' });

  try {
    const out = await module1(useModel, input, Date.now());
    if (out.error) return res.status(502).json({ error: out.error });
    return res.status(200).json(out);
  } catch (e) {
    console.error('module1 failed:', e?.message);
    return res.status(502).json({ error: 'The model service is not reachable. Try again.' });
  }
}

// Claude (Anthropic Messages API), plain fetch.
async function callAnthropic(model, system, input) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 500, error: 'The server is not configured' };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21' },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      output_config: { effort: EXTRACT_EFFORT },
      system: `${system}\nAnswer with one valid JSON object only, no other text.`,
      messages: [{ role: 'user', content: String(input) }]
    })
  });
  const data = await r.json();
  if (!r.ok) { console.error('anthropic error', r.status, data.error?.type); return { status: r.status, error: 'The model service returned an error' }; }
  if (data.stop_reason === 'refusal') return { status: 502, error: 'The model declined this request' };
  // The answer is in the text blocks (thinking blocks are skipped).
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const inTokens = data.usage?.input_tokens || 0, outTokens = data.usage?.output_tokens || 0;
  return { text, usage: { prompt_tokens: inTokens, completion_tokens: outTokens, total_tokens: inTokens + outTokens } };
}

// Read JSON from the model's text, also when it is wrapped in ```json ... ```.
function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start > -1 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch {} }
  return { raw: text };
}

// Cost of one call in US dollars, from the prices in _prompts.js.
function costOf(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  return ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6;
}

// Module 1: extract decisions, check them in code, then write the all-hands text from cleared items only.
async function module1(model, transcript, started) {
  const first = await callAnthropic(model, prompts.extract, transcript);
  if (first.error) return { error: first.error };
  const { decisions, dropped, notes } = applyRules(parseJson(first.text));
  const cleared = allHandsItems(decisions);
  let allHands = null, usage = first.usage;
  if (cleared.length) {
    const second = await callAnthropic(model, prompts.allhands, JSON.stringify(cleared));
    if (second.error) return { error: second.error };
    usage = { prompt_tokens: usage.prompt_tokens + second.usage.prompt_tokens, completion_tokens: usage.completion_tokens + second.usage.completion_tokens };
    const text = parseJson(second.text).text || null;
    const leaked = text ? leakedWords(text, decisions) : [];
    if (leaked.length) notes.push(`All-hands text withheld: it mentions words from items that are not cleared (${leaked.join(', ')}).`);
    else allHands = text;
  } else notes.push('No item is both agreed and labelled all_hands, so there is no all-hands text.');
  return { mode: 'module1', model, decisions, dropped, notes, all_hands: allHands, usage, ms: Date.now() - started, cost_usd: costOf(model, usage) };
}
