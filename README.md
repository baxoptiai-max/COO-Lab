# COO Lab

## 1. What COO Lab is

COO Lab shows how a COO can turn leadership meetings into decisions with owners and dates, and into one all-hands update that only contains what the company is ready to share. It is a Stage 0 AI-Native Baseline: it runs on the tools and the AI provider a company already has, so nothing new needs to be bought or installed. All example data is fictional (a company called Helix Labs). The company news on the mockup page comes from Bioptimus's public pages. No Bioptimus internal information was used.

Live link: https://coo-lab-opti-ai1.vercel.app

## 2. How I built this

I built this in one day with Claude Code, and every step is in the git history. These are the times from `git log` on 19 November 2026 (local time):

| Time | Step |
|---|---|
| 14:11 | New repo from a cleaned copy of an earlier project: no earlier case content, no old history |
| 15:55 | Module 1: decision schema, rule checks in code, 7 fictional test transcripts, a "Try it" box |
| 16:03 | Concept page becomes the front page; the server function is hardened (model allowlist, 12,000 character cap, 20 requests per 10 minutes per IP, no keys or prompts in errors) |
| 16:06 to 16:25 | Live test runner for the deployed link |
| 16:23 | Run 1, the baseline, with no changes |
| 16:30 | Fix round: label rule, goals are not decisions, debug flag behind a token |
| 16:52 | Run 2: 3 runs per case and model |
| 17:13 | Visual style adjusted |
| 17:15 | Fix for the case 4 leak, then Run 2b |

**Prompts, in short.**
- Extraction prompt: read a meeting transcript and return each decision with owner, due date, goal or OKR, label, status, trade-off and a source quote. Never guess; if something is missing, return null. A label other than leadership_only needs an explicit sentence in the transcript. A goal that is only discussed is not a decision. A reversed decision is listed as reversed and its final position as agreed. An item labelled all_hands describes only its own decision.
- All-hands prompt: write 3 to 5 friendly sentences from the cleared items only, with no other topics, alternatives or cancelled plans.
- The rule checks are code, not prompt: missing owner or date, duplicates merged, reversed decisions dropped, labels forced to leadership_only when not stated, and a leak check on the written text.

**Tools.** Claude Code in Paradev (the app), GitHub (public repo), Vercel (hosting and the server function, plain `fetch`, no packages). The model is Claude, compared as Haiku (claude-haiku-5-5) and Sonnet (claude-sonnet-5-5). API keys stay on the server as Vercel environment variables.

**How I used AI and which decisions were mine.** Claude Code wrote the code, the test runner and the first versions of the prompts, and ran the tests. I gave the instructions, reviewed the results and decided what to change.

[MY DECISIONS]

## 3. How it would run

Each week, decisions move from the meeting to an owner and a date, and the COO decides what the whole company hears. Nobody receives anything before a person approves it.

- **Module 1, decision to action (built).** The meeting transcript goes in. Each decision gets an owner, a date, a link to a goal, a status and a label. The code flags missing owners and dates, merges a decision mentioned twice, and keeps only the final position of a reversed one. The all-hands paragraph is written only from items that are agreed and labelled all_hands. You can try it on the front page.
- **Module 2, an always-on all-hands page you can ask (demo; next step is 1b).** One live page holds the mission, targets, decision log and each leader's update. A question is answered with a source, and what can be searched depends on who asks: a leader sees leadership-only items, a colleague does not. The page shows this as a demo with placeholder content. Next step: connect it to the real documents.
- **Module 3, the weekly update (next step).** Each leader's update is drafted from the leadership meeting transcript, and the leader adds or corrects it by voice. On the page, dictation is simulated; no microphone is used. Next step: real speech to text.
- **Human approval points.** The COO approves the decision log and the all-hands text. Each leader signs off on their own update. The system never publishes by itself.
- **All-hands is opt-in.** If a transcript does not say who may hear an item, the item becomes leadership_only and is flagged label_needs_review. An item reaches all-hands only when the transcript says so explicitly.

## 4. Where it fails

The tests found real problems, and the numbers below show what changed after each fix. All cases are fictional.

| | Run 1 (baseline, no changes) | Run 2 (after the fix round) | Run 2b (after the leak fix) |
|---|---|---|---|
| What was run | 7 cases, 1 run per model | 7 cases, 3 runs per model | cases 4 and 6 only (case 4: 3 runs per model, case 6: 1 run per model) |
| Haiku fields | 84% | 96% | case 4: 100% |
| Sonnet fields | 88% | 92% | case 4: 83% (worst run 50%) |
| Haiku flags | 60% | 100% | case 4: 100% |
| Sonnet flags | 60% | 100% | case 4: 75% (worst run 25%) |
| Leaks | 0 | 1 of 21 runs per model (both in case 4) | 0 of 8 runs |
| All-hands text withheld | 0 | 1 of 21 (Haiku), 0 of 21 (Sonnet) | 7 of 8 runs |
| Average response time | Haiku 4.5 s, Sonnet 5.6 s | Haiku 4.4 s, Sonnet 3.8 s | about 3 to 6 s |

The columns are not like for like: I changed some test expectations between Run 1 and Run 2 (listed below), and Run 2b covers only two cases. The full tables are in `tests/results.md` and `tests/results-run2.md`.

**What the diagnosis showed.**
- **A cancellation is a final position.** In case 4 the models marked the first webinar plan as reversed (the code dropped it correctly) but also listed "no webinar series this autumn" as its own decision. I now expect that item to be kept, with no owner or date, and flagged.
- **The model merged duplicates itself.** In case 5 the model already returned one support-hours item, so the merge rule never fired. The case now passes with one merged item, whoever merged it.
- **Goals are not decisions.** Sonnet listed "tickets under 400 a month", a target that was only discussed, as a decision. The prompt now says a goal needs an agreed action, owner or date.
- **Label guessing.** The test expected all_hands for items where the transcript did not say who may hear them. The models guessed in different ways (leadership_only, or no label). The rule is now deterministic: not stated means leadership_only plus label_needs_review.
- **Run-to-run variation.** The same model on the same case scored 10/12 once and 12/12 the next time. One run per case is not a reliable measure, so Run 2 used three.
- **The case 4 leak.** The webinar cancellation was correctly kept out of the all-hands text. The leak came through a cleared item: in some runs the case-study item was worded "one case study per month instead of webinars", and the all-hands text repeated that. The first leak check ignored words that a cleared item also contained. The fix has two parts: the prompt says a cleared item must describe only its own decision, and the leak check now withholds the text when it contains a distinctive word (5 or more letters, not in a short common-words list) from any item that is not cleared, including reversed ones.

**Test expectations I changed, and why.**
- Case 2: the export fix and status page are leadership_only with label_needs_review, because the transcript does not say who may hear them.
- Case 3: the security review also expects label_needs_review, for the same reason.
- Case 4: the final "no webinar series" item is expected (no owner, no date, leadership_only, flagged), and the reversed item must be dropped.
- Case 5: the merged_duplicate flag is no longer required; both items are leadership_only with label_needs_review.
- Cases 1, 6 and 7 are unchanged: their labels are stated in the transcripts.

**Trade-off.** The leak check withholds a paragraph even when the matching word is harmless. In Run 2b it withheld 7 of 8 runs, mostly because of an owner's name or a word the cleared item shares with a related item (for example "dashboard" or "customer"). No board or fundraising word was in any of them. So nothing leaked, but the check is too strict as written and it needs a refinement (for example, ignore owner names). When it withholds, the response returns the text, the reason and the matched words, and the COO can read the text and release it after review.

[MY MODEL CONCLUSION]

## 5. Phase 2

Phase 2 is indicated on the page and not built. It would add two things.

- **KPI scorecard.** One weekly scorecard across R&D, Commercial and Operations, with an owner and a due date for each number, using the same flags as the decision log.
- **Research-to-delivery handoff gates.** A checkpoint at each handoff, from research result to product to delivery, so that each step has an owner, a date and a person who approves before work moves on.
