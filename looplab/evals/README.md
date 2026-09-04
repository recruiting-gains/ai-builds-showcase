# Evaluation evidence

LoopLab separates three kinds of evidence:

| Evidence | What it shows | What it does not show |
| --- | --- | --- |
| The ten public cases in `src/shared/corpus.ts` | The exact exercise and answer keys for a live comparison | Broad coverage of real announcements or security attacks |
| Handwritten controls in `fixtures.ts` and grader unit tests | The fixed checker accepts correct content and rejects specified errors | AI performance, prompt improvement, or a model win |
| A completed live A/B run | Actual responses and measured outcomes for the selected prompts and model on those ten cases | Generalization to unseen inputs or guaranteed future performance |

Run the offline checks with:

```sh
npm run eval
npm test
```

The harness prints its result to the terminal and writes no files. Its controls are manually authored, visibly identified as controls, and must never be displayed as live model results. No API key or network connection is needed by the offline grading harness.

To document a live experiment, copy [EXPERIMENT-TEMPLATE.md](./EXPERIMENT-TEMPLATE.md) into a deliberately chosen result file after completing the run. Leave unmeasured values marked unknown. Do not invent a result to complete a table.

## Verified release runs — September 4, 2026

- [Complete end-to-end run](./2026-09-04-live-run.json): A passed 5/10, B passed 8/10; twenty actual responses, no service errors. Raw responses, prompts, answer keys, grading, settings, and provider-reported model are included.
- [Earlier real inference run](./2026-09-04-earlier-run.json): A passed 6/10, B passed 8/10. Inference and export succeeded; that browser test subsequently timed out waiting for an idle network on refresh. The final test uses explicit application-readiness checks and passed recovery.

The differing A results demonstrate why one run is not a guarantee, even with fixed settings. These files are historical evidence, never responses used to populate the live interface. Read the [release verification](../docs/RELEASE-VERIFICATION.md) for the full test scope and limitations.

The frozen public release is `event-extraction-v1`, SHA-256 `9705d81a811312442125a487bf994201e34f9f14ace00c7342b274925cb0ea6c`. The implementation and versioning rules are described in [LOOP-METHOD.md](../docs/LOOP-METHOD.md).
