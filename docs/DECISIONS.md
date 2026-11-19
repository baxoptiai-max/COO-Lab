# Decisions

- 2026-11-19: Kept only the Demo panel (incl. test runner); deleted all other tabs, glossary Gaide entry, sources, diagrams. Prompts and tests.json replaced by placeholders.
- No GitHub remote created yet; no deploy.
- 2026-11-19: Rule checks live in code (api/_rules.js): reversed items dropped, duplicates merged by word overlap (>=60%), flags for missing owner/date/label/status/quote, all-hands text built only from agreed + all_hands items, and withheld if it uses words from non-cleared items.
- Added field low_confidence (note) for misheard names; label/status outside the allowed values are treated as missing.
- Old Demo panel and test runner removed; replaced by the Module 1 Try-it box.
