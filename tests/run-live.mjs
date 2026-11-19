// Live test: runs the 7 cases in tests.json against the deployed module1 endpoint, once per model.
// Usage: BASE_URL=https://your-deployment node tests/run-live.mjs
// If the deployment is behind Vercel Authentication, also set VERCEL_BYPASS (the project's protection-bypass secret).
// Nothing here changes prompts or rules; it only calls the endpoint and scores the answers.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE) { console.error('Set BASE_URL to the deployed link.'); process.exit(1); }
const MODELS = [['Haiku', 'claude-haiku-5-5'], ['Sonnet', 'claude-sonnet-5-5']];
const cases = JSON.parse(readFileSync(new URL('../tests.json', import.meta.url))).cases;
// ONLY_CASES="2,4,5" runs just those cases (numbers as in the case names). DEBUG=1 also asks for the raw model extraction.
const ONLY = process.env.ONLY_CASES ? process.env.ONLY_CASES.split(',').map(n => Number(n) - 1) : null;
const DEBUG = process.env.DEBUG === '1';
// Case 4 must drop the reversed webinar decision (checked in the table, not only in the text).
const REVERSED_TERM = { 3: 'webinar' };

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => new Set(norm(s).split(' ').filter(w => w.length > 2));
const overlap = (a, b) => { const x = words(a), y = words(b); let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.max(1, x.size + y.size - n); };
const same = (got, want) => want === null || want === undefined ? (got === null || got === undefined) : norm(got) === norm(want) || (got != null && (norm(got).includes(norm(want)) || norm(want).includes(norm(got))));

async function call(model, input) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.VERCEL_BYPASS) headers['x-vercel-protection-bypass'] = process.env.VERCEL_BYPASS;
  const t = Date.now();
  const r = await fetch(BASE + '/api/run', { method: 'POST', headers, body: JSON.stringify({ mode: 'module1', input, model, debug: DEBUG || undefined }) });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { error: 'Not JSON (HTTP ' + r.status + ')' }; }
  return { status: r.status, body, ms: Date.now() - t };
}

function score(c, i, out) {
  const exp = c.expected, got = out.decisions || [];
  // Fields: match each expected decision to the closest actual one, then compare owner, due_date, label, status.
  const used = new Set(); let fieldOk = 0, fieldAll = 0, missingDecisions = 0;
  for (const e of exp.decisions) {
    let best = -1, bs = 0.25;
    got.forEach((g, k) => { const s = overlap(g.decision, e.decision); if (!used.has(k) && s > bs) { bs = s; best = k; } });
    fieldAll += 4;
    if (best < 0) { missingDecisions++; continue; }
    used.add(best); const g = got[best];
    for (const f of ['owner', 'due_date', 'label', 'status']) if (same(g[f], e[f])) fieldOk++;
  }
  const extra = got.length - used.size;
  // Flags: expected flag on the decision whose text contains the given words, plus the reversal check.
  let flagOk = 0, flagAll = 0;
  for (const f of exp.flags) {
    flagAll++;
    const g = got.find(d => norm(d.decision).includes(norm(f.decision_contains)));
    if (g && g.flags.includes(f.flag)) flagOk++;
  }
  if (REVERSED_TERM[i]) {
    flagAll++;
    if (!got.some(d => norm(d.decision).includes(REVERSED_TERM[i])) && (out.dropped || []).length >= 1) flagOk++;
  }
  // Leak: any must-exclude term in the all-hands text. A leak fails the case.
  const text = out.all_hands || '';
  const leaks = c.expected.all_hands_must_exclude.filter(t => norm(text).includes(norm(t)));
  const withheld = !out.all_hands && (out.notes || []).some(n => /withheld/i.test(n));
  return { fieldOk, fieldAll, flagOk, flagAll, extra, missingDecisions, leaks, withheld };
}

const TAG = process.env.RUN_TAG ? '-' + process.env.RUN_TAG : '';
const raw = [];
const rows = [];
for (const [i, c] of cases.entries()) {
  if (ONLY && !ONLY.includes(i)) continue;
  for (const [label, id] of MODELS) {
    const res = await call(id, c.input);
    if (res.status !== 200 || res.body.error) {
      rows.push({ i, label, error: res.body.error || 'HTTP ' + res.status, ms: res.ms });
      console.log(`case ${i + 1} ${label}: ERROR ${res.body.error || res.status}`);
      continue;
    }
    raw.push({ case: c.name, model: label, raw_model_output: res.body.raw_extraction, post_rules_output: { ...res.body, raw_extraction: undefined } });
    const s = score(c, i, res.body);
    rows.push({ i, label, ms: res.ms, ...s });
    console.log(`case ${i + 1} ${label}: fields ${s.fieldOk}/${s.fieldAll} flags ${s.flagOk}/${s.flagAll} leak ${s.leaks.length ? 'YES ' + s.leaks.join(',') : 'no'}`);
  }
}

// Results table.
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : 'n/a';
let md = `# Live test results\n\nDeployment: ${BASE}\nRun: ${new Date().toISOString()}\n\nCases are fictional (Helix Labs). Prompts and rules were not changed during this run.\n\n`;
md += '| Case | Model | Fields | Flags | Leak | All-hands withheld | Extra decisions | Time (s) | Result |\n|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  const name = cases[r.i].name;
  if (r.error) { md += `| ${name} | ${r.label} | n/a | n/a | n/a | n/a | n/a | ${(r.ms / 1000).toFixed(1)} | ERROR: ${r.error} |\n`; continue; }
  const pass = r.leaks.length === 0 && r.fieldOk === r.fieldAll && r.flagOk === r.flagAll;
  md += `| ${name} | ${r.label} | ${r.fieldOk}/${r.fieldAll} | ${r.flagOk}/${r.flagAll} | ${r.leaks.length ? 'LEAK: ' + r.leaks.join(', ') : 'no'} | ${r.withheld ? 'yes' : 'no'} | ${r.extra} | ${(r.ms / 1000).toFixed(1)} | ${r.leaks.length ? 'FAIL (leak)' : pass ? 'pass' : 'partial'} |\n`;
}
md += '\n## Totals per model\n\n| Model | Fields | Flags | Leaks | Withheld | Errors | Avg response time (s) |\n|---|---|---|---|---|---|---|\n';
for (const [label] of MODELS) {
  const m = rows.filter(r => r.label === label), ok = m.filter(r => !r.error);
  const sum = k => ok.reduce((a, r) => a + r[k], 0);
  const avg = m.length ? m.reduce((a, r) => a + r.ms, 0) / m.length / 1000 : 0;
  md += `| ${label} | ${sum('fieldOk')}/${sum('fieldAll')} (${pct(sum('fieldOk'), sum('fieldAll'))}) | ${sum('flagOk')}/${sum('flagAll')} (${pct(sum('flagOk'), sum('flagAll'))}) | ${ok.filter(r => r.leaks.length).length} | ${ok.filter(r => r.withheld).length} | ${m.length - ok.length} | ${avg.toFixed(1)} |\n`;
}
md += '\nScoring: fields = owner, due date, label and status of each expected decision, matched by wording; flags = expected flags on the right decision, plus the reversed webinar decision dropped in case 4; a leak (any all_hands_must_exclude term in the all-hands text) fails the case whatever the other scores.\n';
writeFileSync(new URL(`./results${TAG}.md`, import.meta.url), md);
if (raw.length) { mkdirSync(new URL('./raw/', import.meta.url), { recursive: true }); writeFileSync(new URL(`./raw/raw${TAG}.json`, import.meta.url), JSON.stringify(raw, null, 2)); }
console.log(`Saved tests/results${TAG}.md`);
