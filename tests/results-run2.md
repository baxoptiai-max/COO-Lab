# Live test results (run2)

Deployment: https://coo-lab-opti-ai1.vercel.app
Run: 2026-11-19T15:51:53.436Z
Repeats per case and model: 3

Cases are fictional (Helix Labs). Prompts and rules were not changed during this run.

| Case | Model | Fields avg | Fields worst | Flags avg | Flags worst | Leaks | Withheld | Extra decisions (avg) | Time avg (s) | Errors |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 Normal: onboarding and pricing | Haiku | 67% | 50% | n/a | n/a | 0/3 | 0/3 | 0.7 | 4.9 | 0 |
| 1 Normal: onboarding and pricing | Sonnet | 100% | 100% | n/a | n/a | 0/3 | 0/3 | 0.3 | 4.5 | 0 |
| 2 Normal: support and roadmap | Haiku | 100% | 100% | 100% | 100% | 0/3 | 0/3 | 0.0 | 2.0 | 0 |
| 2 Normal: support and roadmap | Sonnet | 67% | 67% | 100% | 100% | 0/3 | 0/3 | 1.0 | 2.9 | 0 |
| 3 Decision without owner | Haiku | 100% | 100% | 100% | 100% | 0/3 | 0/3 | 0.0 | 4.7 | 0 |
| 3 Decision without owner | Sonnet | 100% | 100% | 100% | 100% | 0/3 | 0/3 | 0.0 | 3.8 | 0 |
| 4 Decision reversed later | Haiku | 100% | 100% | 100% | 100% | 1/3 FAIL | 0/3 | 0.0 | 5.0 | 0 |
| 4 Decision reversed later | Sonnet | 100% | 100% | 100% | 100% | 1/3 FAIL | 0/3 | 0.0 | 4.3 | 0 |
| 5 Same decision mentioned twice | Haiku | 100% | 100% | 100% | 100% | 0/3 | 0/3 | 0.0 | 3.1 | 0 |
| 5 Same decision mentioned twice | Sonnet | 100% | 100% | 100% | 100% | 0/3 | 0/3 | 0.0 | 2.3 | 0 |
| 6 Board item next to a product decision | Haiku | 100% | 100% | n/a | n/a | 0/3 | 1/3 | 1.0 | 5.6 | 0 |
| 6 Board item next to a product decision | Sonnet | 100% | 100% | n/a | n/a | 0/3 | 0/3 | 1.7 | 5.4 | 0 |
| 7 Misheard model or partner name | Haiku | 100% | 100% | 100% | 100% | 0/3 | 0/3 | 0.3 | 5.8 | 0 |
| 7 Misheard model or partner name | Sonnet | 88% | 88% | 100% | 100% | 0/3 | 0/3 | 0.3 | 3.4 | 0 |

## Totals per model

| Model | Fields | Flags | Runs with a leak | Runs withheld | Errors | Avg time (s) |
|---|---|---|---|---|---|---|
| Haiku | 172/180 (96%) | 36/36 (100%) | 1 of 21 | 1 of 21 | 0 | 4.4 |
| Sonnet | 165/180 (92%) | 36/36 (100%) | 1 of 21 | 0 of 21 | 0 | 3.8 |

Scoring: fields = owner, due date, label and status of each expected decision, matched by wording; flags = expected flags on the right decision, plus the reversed decision dropped (case 4); a leak (any all_hands_must_exclude term in the all-hands text) fails the case whatever the other scores. "Worst" is the lowest run of the repeats.


## Run 2b – leak fix

Run: after the leak-fix commit (withhold the all-hands text when it contains distinctive words from any non-cleared item, including reversed ones; cleared items must describe only their own decision). Case 4: 3 runs per model. Case 6: 1 run per model, to look for new false withholds. Fictional Helix Labs cases; prompts and rules were not changed during this run.

| Case | Model | Fields avg | Fields worst | Flags avg | Flags worst | Leaks | Withheld | Extra decisions (avg) | Time avg (s) | Errors |
|---|---|---|---|---|---|---|---|---|---|---|
| 4 Decision reversed later | Haiku | 100% | 100% | 100% | 100% | 0/3 | 3/3 | 0.0 | 5.9 | 0 |
| 4 Decision reversed later | Sonnet | 83% | 50% | 75% | 25% | 0/3 | 2/3 | 0.0 | 6.2 | 0 |
| 6 Board item next to a product decision | Haiku | 100% | 100% | n/a | n/a | 0/1 | 1/1 | 1.0 | 6.1 | 0 |
| 6 Board item next to a product decision | Sonnet | 100% | 100% | n/a | n/a | 0/1 | 1/1 | 0.0 | 3.4 | 0 |

Findings:
- Leaks: 0 of 8 runs (Run 2: 1 of 3 on case 4 for each model). The fix stops the leak.
- Withheld: 7 of 8 runs. The safety net is too strict as written. The words that triggered it were mostly harmless: the owner's name (priya, in 5 of 6 case 4 runs) and, in case 6, words the cleared dashboard item shares with a related leadership-only item or a reversed earlier date (customer, dashboard, launch, support). No board or fundraising word appeared in any of them.
- Case 4, Sonnet, run 1 scored 4/8 fields and 1/4 flags because the model did not list the "no webinar series" item at all; the other five case 4 runs scored 100%.
- Not changed in this run: owner names and words shared with related items still count. Options: ignore owner names, or compare only against items on other topics. The COO can release any withheld text after review; the response includes the text and the matched words.
