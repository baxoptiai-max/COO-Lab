// Live test: runs the cases in tests.json against the deployed module1 endpoint, once or several times per model.
// Usage: BASE_URL=https://your-deployment node tests/run-live.mjs
// Options (environment): RUNS=3 repeats each case per model; ONLY_CASES="2,4,5" limits the cases; RUN_TAG=run2 names the
// output files (tests/results-run2.md); DEBUG_TOKEN=... asks the server for the raw model output (tests/raw/).
// The server allows 20 requests per 10 minutes per IP, so calls are paced (one every 31 s).
// Nothing here changes prompts or rules; it only calls the endpoint and scores the answers.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE) { console.error('Set BASE_URL to the deployed link.'); process.exit(1); }
const MODELS = [['Haiku', 'claude-haiku-5-5'], ['Sonnet', 'claude-sonnet-5-5']];
const cases = JSON.parse(readFileSync(new URL('../tests.json', import.meta.url))).cases;
const ONLY = process.env.ONLY_CASES ? process.env.ONLY_CASES.split(',').map(n => Number(n) - 1) : null;
const RUNS = Number(process.env.RUNS || 1);
const TAG = process.env.RUN_TAG ? '-' + process.env.RUN_TAG : '';
const PACE_MS = Number(process.env.PACE_MS ?? 31000);

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => new Set(norm(s).split(' ').filter(w => w.length > 2));
const overlap = (a, b) => { const x = words(a), y = words(b); let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.max(1, x.size + y.size - n); };
const same = (got, want) => want === null || want === undefined ? (got === null || got === undefined) : got != null && (norm(got) === norm(want) || norm(got).includes(norm(want)) || norm(want).includes(norm(got)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastCall = 0;

async function call(model, input) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.VERCEL_BYPASS) headers['x-vercel-protection-bypass'] = process.env.VERCEL_BYPASS;
  if (process.env.DEBUG_TOKEN) headers['x-debug-token'] = process.env.DEBUG_TOKEN;
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastCall + PACE_MS - Date.now(); if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const t = Date.now();
    const r = await fetch(BASE + '/api/run', { method: 'POST', headers, body: JSON.stringify({ mode: 'module1', input, model }) });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = { error: 'Not JSON (HTTP ' + r.status + ')' }; }
    if (r.status === 429) { await sleep(60000); continue; }
    return { status: r.status, body, ms: Date.now() - t };
  }
  return { status: 429, body: { error: 'Rate limited' }, ms: 0 };
}

function score(c, out) {
  const exp = c.expected, got = out.decisions || [];
  // Fields: match each expected decision to the closest actual one, then compare owner, due_date, label, status.
  const used = new Set(); let fieldOk = 0, fieldAll = 0;
  for (const e of exp.decisions) {
    let best = -1, bs = 0.25;
    got.forEach((g, k) => { const s = overlap(g.decision, e.decision); if (!used.has(k) && s > bs) { bs = s; best = k; } });
    fieldAll += 4;
    if (best < 0) continue;
    used.add(best); const g = got[best];
    for (const f of ['owner', 'due_date', 'label', 'status']) if (same(g[f], e[f])) fieldOk++;
  }
  const extra = got.length - used.size;
  // Flags: each expected flag must be on the decision whose text contains the given words.
  let flagOk = 0, flagAll = 0;
  for (const f of exp.flags) {
    flagAll++;
    const g = got.find(d => norm(d.decision).includes(norm(f.decision_contains)));
    if (g && g.flags.includes(f.flag)) flagOk++;
  }
  // Reversal: the reversed item (identified by its due date) is not in the table and the server reported it as dropped.
  if (exp.reversed_due_date) {
    flagAll++;
    if (!got.some(d => same(d.due_date, exp.reversed_due_date)) && (out.dropped || []).length >= 1) flagOk++;
  }
  // Leak: any must-exclude term in the all-hands text. A leak fails the case.
  const text = norm(out.all_hands || '');
  const leaks = exp.all_hands_must_exclude.filter(t => text.includes(norm(t)));
  const withheld = !out.all_hands && (out.notes || []).some(n => /withheld/i.test(n));
  return { fieldOk, fieldAll, flagOk, flagAll, extra, leaks, withheld };
}

const runs = [], raw = [];
for (let n = 1; n <= RUNS; n++) {
  for (const [i, c] of cases.entries()) {
    if (ONLY && !ONLY.includes(i)) continue;
    for (const [label, id] of MODELS) {
      const res = await call(id, c.input);
      if (res.status !== 200 || res.body.error) {
        runs.push({ i, label, run: n, error: res.body.error || 'HTTP ' + res.status, ms: res.ms });
        console.log(`run ${n} case ${i + 1} ${label}: ERROR ${res.body.error || res.status}`);
        continue;
      }
      raw.push({ run: n, case: c.name, model: label, raw_model_output: res.body.raw_extraction, post_rules_output: { ...res.body, raw_extraction: undefined } });
      const s = score(c, res.body);
      runs.push({ i, label, run: n, ms: res.ms, ...s });
      console.log(`run ${n} case ${i + 1} ${label}: fields ${s.fieldOk}/${s.fieldAll} flags ${s.flagOk}/${s.flagAll} extra ${s.extra} leak ${s.leaks.length ? 'YES ' + s.leaks.join(',') : 'no'}`);
    }
  }
}

// Results. Per case and model: average and worst run (fields and flags), leaks, withheld, extras, time.
const pct = (a, b) => b ? Math.round(100 * a / b) : null;
const show = v => v === null ? 'n/a' : v + '%';
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const caseIdx = [...new Set(runs.map(r => r.i))];
let md = `# Live test results${TAG ? ' (' + TAG.slice(1) + ')' : ''}\n\nDeployment: ${BASE}\nRun: ${new Date().toISOString()}\nRepeats per case and model: ${RUNS}\n\nCases are fictional (Helix Labs). Prompts and rules were not changed during this run.\n\n`;
md += '| Case | Model | Fields avg | Fields worst | Flags avg | Flags worst | Leaks | Withheld | Extra decisions (avg) | Time avg (s) | Errors |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
const totals = {};
for (const i of caseIdx) for (const [label] of MODELS) {
  const all = runs.filter(r => r.i === i && r.label === label), ok = all.filter(r => !r.error);
  if (!all.length) continue;
  const fp = ok.map(r => pct(r.fieldOk, r.fieldAll)), gp = ok.map(r => pct(r.flagOk, r.flagAll));
  const leaks = ok.filter(r => r.leaks.length).length, withheld = ok.filter(r => r.withheld).length;
  const flagsDefined = gp.filter(v => v !== null);
  md += `| ${cases[i].name} | ${label} | ${show(ok.length ? Math.round(avg(fp)) : null)} | ${show(ok.length ? Math.min(...fp) : null)} | ${show(flagsDefined.length ? Math.round(avg(flagsDefined)) : null)} | ${show(flagsDefined.length ? Math.min(...flagsDefined) : null)} | ${leaks}/${ok.length}${leaks ? ' FAIL' : ''} | ${withheld}/${ok.length} | ${avg(ok.map(r => r.extra)).toFixed(1)} | ${(avg(all.map(r => r.ms)) / 1000).toFixed(1)} | ${all.length - ok.length} |\n`;
}
md += '\n## Totals per model\n\n| Model | Fields | Flags | Runs with a leak | Runs withheld | Errors | Avg time (s) |\n|---|---|---|---|---|---|---|\n';
for (const [label] of MODELS) {
  const all = runs.filter(r => r.label === label), ok = all.filter(r => !r.error);
  if (!all.length) continue;
  const sum = k => ok.reduce((a, r) => a + r[k], 0);
  md += `| ${label} | ${sum('fieldOk')}/${sum('fieldAll')} (${show(pct(sum('fieldOk'), sum('fieldAll')))}) | ${sum('flagOk')}/${sum('flagAll')} (${show(pct(sum('flagOk'), sum('flagAll')))}) | ${ok.filter(r => r.leaks.length).length} of ${ok.length} | ${ok.filter(r => r.withheld).length} of ${ok.length} | ${all.length - ok.length} | ${(avg(all.map(r => r.ms)) / 1000).toFixed(1)} |\n`;
}
md += '\nScoring: fields = owner, due date, label and status of each expected decision, matched by wording; flags = expected flags on the right decision, plus the reversed decision dropped (case 4); a leak (any all_hands_must_exclude term in the all-hands text) fails the case whatever the other scores. "Worst" is the lowest run of the repeats.\n';
writeFileSync(new URL(`./results${TAG}.md`, import.meta.url), md);
mkdirSync(new URL('./raw/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./raw/raw${TAG}.json`, import.meta.url), JSON.stringify(raw, null, 2));
console.log(`Saved tests/results${TAG}.md`);
