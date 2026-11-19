# Live test results

Deployment: https://coo-lab-opti-ai1.vercel.app
Run: 2026-11-19T15:18:19.225Z

Cases are fictional (Helix Labs). Prompts and rules were not changed during this run.

| Case | Model | Fields | Flags | Leak | All-hands withheld | Extra decisions | Time (s) | Result |
|---|---|---|---|---|---|---|---|---|
| 1 Normal: onboarding and pricing | Haiku | 4/8 | 0/0 | no | no | 2 | 6.6 | partial |
| 1 Normal: onboarding and pricing | Sonnet | 8/8 | 0/0 | no | no | 1 | 4.1 | pass |
| 2 Normal: support and roadmap | Haiku | 10/12 | 0/0 | no | no | 0 | 1.8 | partial |
| 2 Normal: support and roadmap | Sonnet | 7/12 | 0/0 | no | no | 1 | 2.6 | partial |
| 3 Decision without owner | Haiku | 8/8 | 1/1 | no | no | 0 | 3.5 | pass |
| 3 Decision without owner | Sonnet | 8/8 | 1/1 | no | no | 0 | 3.7 | pass |
| 4 Decision reversed later | Haiku | 4/4 | 0/1 | no | no | 1 | 5.8 | partial |
| 4 Decision reversed later | Sonnet | 4/4 | 0/1 | no | no | 1 | 4.0 | partial |
| 5 Same decision mentioned twice | Haiku | 6/8 | 0/1 | no | no | 0 | 2.5 | partial |
| 5 Same decision mentioned twice | Sonnet | 6/8 | 0/1 | no | no | 0 | 2.1 | partial |
| 6 Board item next to a product decision | Haiku | 8/8 | 0/0 | no | no | 1 | 5.9 | pass |
| 6 Board item next to a product decision | Sonnet | 8/8 | 0/0 | no | no | 2 | 12.5 | pass |
| 7 Misheard model or partner name | Haiku | 7/8 | 2/2 | no | no | 1 | 5.2 | partial |
| 7 Misheard model or partner name | Sonnet | 8/8 | 2/2 | no | no | 0 | 10.2 | pass |

## Totals per model

| Model | Fields | Flags | Leaks | Withheld | Errors | Avg response time (s) |
|---|---|---|---|---|---|---|
| Haiku | 47/56 (84%) | 3/5 (60%) | 0 | 0 | 0 | 4.5 |
| Sonnet | 49/56 (88%) | 3/5 (60%) | 0 | 0 | 0 | 5.6 |

Scoring: fields = owner, due date, label and status of each expected decision, matched by wording; flags = expected flags on the right decision, plus the reversed webinar decision dropped in case 4; a leak (any all_hands_must_exclude term in the all-hands text) fails the case whatever the other scores.
