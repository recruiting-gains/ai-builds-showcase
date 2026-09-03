# Simulated blinded A/B evaluation

## What this is—and is not

This is a simulated expert/heuristic comparison of two product variants. It is **not** a real human double-blind study, usability study, experiment, or source of customer evidence. No participants were recruited and no behavioral claims should be inferred.

The purpose was to apply one frozen rubric to the first working build and an evidence-based revision without changing the criteria to favor the revision.

## Materials and masking

- Variant A screenshots and metrics were frozen in `docs/evaluation/variant-a/` before Opponent-driven product changes.
- Variant B screenshots and metrics were frozen in `docs/evaluation/variant-b/` after the changes and repeated browser gate.
- The rubric in `docs/evaluation/RUBRIC.md` was frozen before Variant B work.
- A local cryptographic random draw assigned the worksheet order: **Packet Lumen = Variant A; Packet Slate = Variant B**.
- During scoring, the worksheet referred to Packet Lumen and Packet Slate rather than “old” and “new.”

Masking was necessarily limited. The same AI system built and evaluated both variants, product differences can reveal sequence, and there were no independent observers. The packet names reduce framing in the written comparison; they do not create true blinding.

## Frozen results

| Dimension | Weight | Packet Lumen | Packet Slate | Evidence behind difference |
| --- | ---: | ---: | ---: | --- |
| Comprehension in five seconds | 15 | 12.0 | 14.4 | Slate names business owners/professionals above the fold and explains the public-online-community use case. |
| Trust | 15 | 10.5 | 14.4 | Slate replaces the perfect 100 demo with 87, explains conditional rules, and distinguishes app answer storage from host metadata. |
| Visual memorability | 15 | 13.5 | 14.1 | Both retain the crossed-megaphone identity; Slate adds a score-progress ring without changing the editorial system. |
| Usefulness | 15 | 12.0 | 13.8 | Slate turns context into an explicit private lens and preserves the same auditable seven-factor decision. |
| Task completion | 15 | 9.6 | 14.1 | Slate adds a two-minute expectation, four checklist sections, live 0/11 progress, and a denser but scan-friendly result. |
| Accessibility | 10 | 8.4 | 10.0 | Lumen had 45 px result-state mobile overflow. Slate passes Axe with zero violations and zero overflow through a full animation cycle. |
| Performance | 10 | 9.0 | 9.4 | Slate remains three small core documents at about 24.2 KiB combined gzip, two first-load subresources, no external requests, and no console errors. |
| GitHub exploration | 5 | 1.0 | 5.0 | Slate includes a real screenshot, plain-English README, architecture, exact model, commands, evidence, and limitations. |
| **Weighted total** | **100** | **76.0** | **95.2** |  |

Packet Slate is Variant B and is the implementation retained in the product. The 19.2-point difference is a heuristic rubric result, not a measured user preference or conversion lift.

## Measurable comparison

| Measure | Variant A | Variant B |
| --- | ---: | ---: |
| Unit/API/static tests at final gate | 52 pass at the A checkpoint | 61 pass after structural and documentation-link checks |
| Browser checks at final cycle | 16 pass after first-build corrections | 17 pass, including result-state and animation-cycle overflow |
| Mobile result overflow at capture | 45 px | 0 px |
| Axe serious/critical violations | 0 after first-build contrast fixes | 0 violations of any reported impact |
| Core HTML + CSS + JS gzip | about 22.6 KiB | about 24.2 KiB |
| External runtime requests | 0 | 0 |
| Console errors | 0 | 0 |
| Result-state DOM nodes | 684 | 720 |

Variant A’s browser transfer-byte field was cache-skewed, so it was excluded from comparative scoring. Variant B records both browser resource bodies and per-file build/gzip sizes. Local navigation timing varies with the test environment and is not treated as field performance.

## Protocol for a genuine future double-blind study

1. Pre-register the frozen hypotheses, success measures, exclusion rules, and analysis before recruiting.
2. Recruit business owners and professionals across technical comfort levels, including people who use keyboard navigation and assistive technology. Compensate them consistently.
3. Have a study coordinator package two deployable variants under neutral codes. The facilitator and participant should not know which is the candidate version; the analyst should receive coded exports.
4. Randomize exposure order and counterbalance two fictional scenarios of matched difficulty to reduce learning effects.
5. Show each landing page for five seconds, remove it, and collect unaided audience/job/meaning recall.
6. Ask participants to complete a standardized manual room-check scenario, including one exclusion case, without facilitator coaching.
7. Record completion, time on task, wrong turns, unanswered items, label comprehension, keyboard or assistive-technology blockers, and whether participants correctly explain why “Stay quiet” can be success.
8. Collect the same post-task survey after each coded variant, then ask comparative questions only after both tasks.
9. Unmask variants only after the analysis table is locked. Publish non-identifying methods, failures, and uncertainty alongside results.

## Proposed survey

Use a 1–5 scale unless the item is open response.

1. In one sentence, what is this product for? *(open response, asked after the five-second exposure)*
2. Who is it intended for? *(open response)*
3. How confident are you that the product does not read the original discussion?
4. How clear was the difference between score points, penalties, caps, and exclusions?
5. How clear was it that staying quiet can be the correct completed result?
6. How comfortable were you answering the checklist without sharing private or identifying information?
7. How easy was it to know what to do next at every step?
8. How visually distinctive was the product after a short delay?
9. Would you inspect the repository or scoring formula further? Why or why not? *(choice plus open response)*
10. What, if anything, felt misleading, promotional, slow, inaccessible, or unnecessary? *(open response)*
