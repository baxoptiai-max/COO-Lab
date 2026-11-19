// One server function for the whole kit.
// GET  -> the models the page may offer (from _prompts.js).
// POST { mode, input, model } -> calls the model and returns JSON, token usage, response time and cost.
// mode "extract" = the use case step, on Claude (Anthropic). mode "judge" = the eval judge, on OpenAI.
// The instructions, models and prices live in _prompts.js; any "system" field from the browser is ignored.
// The keys come from the Vercel environment variables ANTHROPIC_API_KEY and OPENAI_API_KEY
// and never reach the browser.

import { applyRules, allHandsItems, leakedWords } from './_rules.js';
import { prompts, fields, EXTRACT_MODELS, DEFAULT_EXTRACT_MODEL, EXTRACT_EFFORT, JUDGE_MODEL, PRICES } from './_prompts.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      extract_models: Object.entries(EXTRACT_MODELS).map(([id, m]) => ({ id, label: m.label })),
      default_model: DEFAULT_EXTRACT_MODEL,
      judge_model: JUDGE_MODEL
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gebruik GET of POST' });

  const { mode = 'extract', input = '', model } = req.body || {};
  if (mode !== 'module1' && !Object.hasOwn(prompts, mode)) return res.status(400).json({ error: 'Onbekende modus' });
  if (!input) return res.status(400).json({ error: 'Geen invoer ontvangen' });
  if (String(input).length > 20000) return res.status(400).json({ error: 'Invoer te lang voor de demo' });

  // The judge always uses JUDGE_MODEL; the use case may only use a model from the allowlist.
  const useModel = mode === 'judge' ? JUDGE_MODEL : (model || DEFAULT_EXTRACT_MODEL);
  if (mode !== 'judge' && !Object.hasOwn(EXTRACT_MODELS, useModel)) return res.status(400).json({ error: 'Onbekend model' });

  try {
    const started = Date.now();
    if (mode === 'module1') return res.status(200).json(await module1(useModel, input, started));
    const result = mode === 'judge'
      ? await callOpenAI(useModel, prompts[mode], input)
      : await callAnthropic(useModel, prompts[mode], input);
    const ms = Date.now() - started;
    if (result.error) return res.status(result.status).json({ error: result.error });

    return res.status(200).json({
      mode,
      model: useModel,
      // For "extract", also send the field list so the page can show one row per field.
      fields: mode === 'extract' ? fields : undefined,
      output: parseJson(result.text),
      usage: result.usage,
      ms,
      cost_usd: costOf(useModel, result.usage)
    });
  } catch (e) {
    return res.status(500).json({ error: 'De modelaanbieder is niet bereikbaar', detail: String(e) });
  }
}

// Claude (Anthropic Messages API), plain fetch.
async function callAnthropic(model, system, input) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 500, error: 'ANTHROPIC_API_KEY is niet ingesteld in Vercel' };
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
  if (!r.ok) return { status: r.status, error: data.error?.message || 'Fout bij Anthropic' };
  if (data.stop_reason === 'refusal') return { status: 502, error: 'Het model heeft dit verzoek geweigerd' };
  // The answer is in the text blocks (thinking blocks are skipped).
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const inTokens = data.usage?.input_tokens || 0, outTokens = data.usage?.output_tokens || 0;
  return { text, usage: { prompt_tokens: inTokens, completion_tokens: outTokens, total_tokens: inTokens + outTokens } };
}

// OpenAI (Chat Completions API), plain fetch. Used for the judge.
async function callOpenAI(model, system, input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: 500, error: 'OPENAI_API_KEY is niet ingesteld in Vercel' };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\nAlways answer with valid JSON only.` },
        { role: 'user', content: String(input) }
      ]
    })
  });
  const data = await r.json();
  if (!r.ok) return { status: r.status, error: data.error?.message || 'Fout bij OpenAI' };
  return { text: data.choices[0].message.content, usage: data.usage };
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
