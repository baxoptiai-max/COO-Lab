// Rule checks for Phase 1a. These run in code, not in the prompt, on what the model returned.
// (The underscore keeps Vercel from turning this file into its own web address.)
import { LABELS, STATUSES, fields } from './_prompts.js';

const empty = v => v === null || v === undefined || String(v).trim() === '' || /^(unknown|tbd|n\/a|none)$/i.test(String(v).trim());
const words = t => String(t || '').toLowerCase().match(/[a-z0-9]+/g) || [];
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'we', 'will', 'and', 'for', 'in', 'on', 'is', 'be', 'by', 'at', 'it', 'that', 'this', 'with', 'our']);
const tokens = t => new Set(words(t).filter(w => !STOP.has(w)));

// Two decisions are "the same" when most of their content words overlap.
function similar(a, b) {
  const x = tokens(a.decision), y = tokens(b.decision);
  if (!x.size || !y.size) return false;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both) >= 0.6;
}

function addFlag(d, flag) { if (!d.flags.includes(flag)) d.flags.push(flag); }

// Returns { decisions, dropped, notes }.
export function applyRules(raw) {
  let items = (Array.isArray(raw?.decisions) ? raw.decisions : []).map(d => {
    const o = { flags: [] };
    for (const f of fields) o[f] = empty(d?.[f]) ? null : d[f];
    o.label_stated = d?.label_stated === true;
    o.low_confidence = empty(d?.low_confidence) ? null : d.low_confidence;
    return o;
  });
  const dropped = [], notes = [];

  // 1. Reversed: keep only the final position.
  const kept = [];
  for (const d of items) (d.status === 'reversed' ? dropped : kept).push(d);
  if (dropped.length) notes.push(`${dropped.length} reversed decision(s) removed; only the final position is kept.`);
  items = kept;

  // 2. Duplicates: merge the same decision mentioned twice.
  const merged = [];
  for (const d of items) {
    const first = merged.find(m => similar(m, d));
    if (!first) { merged.push(d); continue; }
    for (const f of fields) if (first[f] === null && d[f] !== null) first[f] = d[f];
    if (d.source_quote && d.source_quote !== first.source_quote) first.source_quote = `${first.source_quote} … ${d.source_quote}`;
    first.low_confidence = first.low_confidence || d.low_confidence;
    if (!first.label_stated && d.label_stated) { first.label = d.label; first.label_stated = true; }
    addFlag(first, 'merged_duplicate');
  }
  if (merged.length < items.length) notes.push(`${items.length - merged.length} duplicate mention(s) merged.`);

  // 3. Flags for missing or invalid data.
  for (const d of merged) {
    if (d.owner === null) addFlag(d, 'missing_owner');
    if (d.due_date === null) addFlag(d, 'missing_date');
    if (d.source_quote === null) addFlag(d, 'missing_quote');
    if (d.low_confidence) addFlag(d, 'low_confidence');
    // Label rule: all_hands (or board_only) only when the transcript says so; otherwise leadership_only, for review.
    if (d.label !== null && !LABELS.includes(d.label)) d.label = null;
    if (!d.label_stated || d.label === null) { d.label = 'leadership_only'; addFlag(d, 'label_needs_review'); }
    if (d.status !== null && !STATUSES.includes(d.status)) { d.status = null; }
    if (d.status === null) addFlag(d, 'missing_status');
  }
  return { decisions: merged, dropped, notes };
}

// All-hands: only agreed items labelled all_hands may go in. Anything unlabelled is treated as not cleared.
export const allHandsItems = decisions => decisions
  .filter(d => d.label === 'all_hands' && d.status === 'agreed')
  .map(({ decision, owner, due_date, goal_or_okr }) => ({ decision, owner, due_date, goal_or_okr }));

// Leak check on the written text: any distinctive word (5+ letters, not a common word) from a non-cleared item must not
// appear in it, even when a cleared item uses the same word. Dropped (reversed) items count as non-cleared.
const COMMON = new Set(['about','after','again','agreed','allow','also','around','because','before','being','between','both','could','decision','doing','during','each','every','first','from','have','having','into','item','items','just','later','less','make','making','more','most','much','must','need','next','other','others','over','plan','plans','should','since','some','start','still','such','team','than','that','their','them','then','there','these','they','this','those','through','under','until','update','using','want','were','what','when','where','which','while','will','with','within','without','work','would','your','january','february','march','april','june','july','august','september','october','november','december','monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
// Compare words without a plural ending, so "webinars" matches "webinar".
const stem = w => w.replace(/ies$/, 'y').replace(/s$/, '');
export function leakedWords(text, decisions, dropped = []) {
  const own = new Set(words(text).map(stem));
  const out = new Set();
  const others = [...decisions.filter(d => !(d.label === 'all_hands' && d.status === 'agreed')), ...dropped];
  for (const d of others) {
    for (const w of words(`${d.decision || ''} ${d.trade_off || ''} ${d.goal_or_okr || ''}`)) {
      if (/^[a-z]{5,}$/.test(w) && !COMMON.has(w) && own.has(stem(w))) out.add(w);
    }
  }
  return [...out];
}
