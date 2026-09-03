# The Opponent

The Opponent is a deliberately skeptical review pass. It assumes the current version is not good enough and requires evidence for every finding. It does not invent user-study results.

## Cycle 1 — Variant A

Evidence: `docs/evaluation/variant-a/`, the production bundle report, 52 unit/API tests, 16 Chromium checks, Axe output, and source review.

### Rubric score before changes

| Dimension | Rating | Weighted score | Evidence |
| --- | ---: | ---: | --- |
| Comprehension in five seconds | 4.0/5 | 12.0/15 | The headline and promise explain restraint and evaluation, but the intended business/professional audience is not explicit in the opening viewport. |
| Trust | 3.5/5 | 10.5/15 | Boundaries and exact math are prominent. A perfect-score fictional demo looks engineered, and “no server storage” is broader than an app can guarantee about future host metadata. |
| Visual memorability | 4.5/5 | 13.5/15 | The crossed-megaphone identity, editorial type, orange/bone palette, and orbital silence graphic are distinct at 1440 px and 390 px. |
| Usefulness | 4.0/5 | 12.0/15 | Seven weighted factors and decisive guardrails support a real decision. The required business-context step does not explain how it helps judgment. |
| Task completion | 3.2/5 | 9.6/15 | Primary, exclusion, invalid, slow, and unavailable-network paths work. Eleven ungrouped questions have no answered-count or time expectation. |
| Accessibility | 4.2/5 | 8.4/10 | Axe serious/critical scan, keyboard path, reduced motion, no-script reading, and landing widths pass. The completed result has 45 px mobile overflow. |
| Performance | 4.5/5 | 9.0/10 | Three first-party resources, about 22.6 KB combined gzip, 684 result-state DOM nodes, no console errors, and no external requests. Local timing is not a public-network benchmark. |
| GitHub exploration | 1.0/5 | 1.0/5 | The implementation exists, but there is no project README, real-app hero image, architecture explanation, or review evidence summary yet. |
| **Total** |  | **76.0/100** |  |

### High severity

1. **Completed mobile result overflows horizontally.** Variant A metrics record `horizontalOverflow: 45`; the dense factor table is the visible source area. This breaks the explicit no-overflow requirement after the main journey, even though landing-only width tests passed.
2. **Privacy wording overclaims future hosting behavior.** “No server storage” and “saves nothing” describe more than the application controls. The code creates no database or request history, but a future host can process standard operational metadata. The product must distinguish answer-data storage from host metadata.
3. **The repository presentation is not reviewable in 30 seconds.** No project README or architecture/testing handoff exists. A GitHub visitor cannot yet assess the product without reading source.

### Medium severity

1. **The required context step has unclear value.** It stays local and appears in the result, but it does not affect the score and the interface does not say that. To a time-limited owner this can feel like unexplained collection.
2. **The 100/100 fictional demo weakens skepticism resistance.** A perfect example can look selected to advertise the tool rather than demonstrate tradeoffs.
3. **Eleven questions read as one long block.** The checklist has strong individual labels but no group landmarks, time estimate, or answered-count feedback.
4. **The intended audience is implicit above the fold.** “Real experience” is broad; business owners and professionals should see themselves immediately.
5. **Content-Type validation accepts prefixes.** `application/jsonp` passes a `startsWith("application/json")` check. The parser still safely rejects an invalid body, but the media-type boundary should be exact.
6. **Performance transfer bytes are cache-skewed in the capture script.** Variant A recorded 2,258 bytes after a reload. Build gzip sizes are reliable; the browser transfer field is not representative enough for comparison.

### Low severity

1. The result dial communicates the number but does not encode magnitude visually.
2. Browser installation depends on the standard Playwright browser download; this cloud environment required a registry-delivered Chromium fallback because its browser CDN was blocked.
3. The local-storage-disabled path remains functional but does not tell the visitor that context persistence failed.

### Perspective challenges

- **Skeptical everyday user:** “Is this secretly AI or marketing?” The deterministic/no-AI explanation answers this, but the perfect demo score feels promotional.
- **Time-limited small-business owner:** “Why answer setup questions that do not change the math, and how long will eleven questions take?”
- **Senior product designer:** The identity and hierarchy are strong; the post-submit mobile table and ungrouped form need another layout pass.
- **Conversion critic:** The promise and CTA are clear, but audience recognition and effort expectation should be above the first action.
- **Accessibility specialist:** Keyboard semantics and contrast pass after the first browser corrections; result-state overflow remains a release blocker.
- **Privacy/security reviewer:** Data minimization is strong. Hosting metadata wording and loose JSON media-type matching need correction.
- **Performance engineer:** The bundle is lean and first-party only. Capture methodology needs uncached encoded-body sizes and result-state overflow checks.
- **Open-source visitor:** Without README, screenshot, architecture, and evidence, the folder does not yet communicate why it is worth exploring.

## Cycle 2 — Variant B

Evidence: `docs/evaluation/variant-b/`, 61 unit/API/static tests, 17 Chromium checks, zero reported Axe violations, the production build, and the completed README/diff review.

### Resolved from Cycle 1

- The mobile factor table became stacked result cards. Completed-state checks now show zero overflow at 320, 390, 768, and 1440 px.
- A later capture exposed 14 px of animation-timed overflow after the initial fix. The rotating/scaling bounding box was removed and an eight-sample, four-second mobile animation-cycle test now guards it.
- Privacy copy now promises no **application answer history** and explicitly notes that a future host may process standard operational metadata.
- Broad context is labeled as a private, local, non-scoring lens and is used to remind the visitor of their selected experience boundary.
- The fictional case now scores 87, includes conditional rules and disclosure, and no longer presents a perfect showcase outcome.
- The checklist now states the expected time, groups questions into four reasoning stages, and reports live completion out of eleven.
- The opening viewport explicitly names business owners and professionals.
- JSON media-type validation is exact; `application/jsonp` has a regression test.
- The capture records uncached body sizes, per-file gzip sizes, external requests, console errors, DOM count, and overflow.
- The project README now provides a real screenshot, architecture, exact scoring model, boundaries, setup, test commands, deployment handoff, and honest limitations.

### Cycle 2 rubric result

The frozen simulated evaluation scores Variant B at **95.2/100**, up from Variant A’s 76.0/100. See `docs/BLINDED-EVALUATION.md` for weighting and limitations.

### High severity

None found.

### Medium severity

None found after the full automated and visual retest.

### Remaining low severity / limitations

1. The score relies on honest self-report and cannot verify the source discussion by design.
2. Automated Axe, keyboard, and semantic tests do not replace evaluation by people who use assistive technology.
3. Local production timings are not field performance data.
4. Localization is not implemented.
5. Host-level abuse controls and metadata policy must be chosen before an approved public deployment; adding a Cloudflare resource now would violate the no-deployment boundary.

### Stop decision

A third improvement cycle was not started. No high-severity or worthwhile medium-severity finding remains; further changes would be cosmetic, require unverifiable user claims, add complexity, or cross the product/deployment boundaries.
