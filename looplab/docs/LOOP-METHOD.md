# The loop behind LoopLab

LoopLab is a small experiment about how instructions affect an AI's answers. Two prompts receive the same ten fictional event announcements. A fixed program checks whether each answer names the confirmed location, copies the date, and includes only supplies attendees must bring. You can inspect the announcement, the answer key, the model's actual answer, and the reason each field passed or failed.

## What “Karpathy-inspired” means here

Andrej Karpathy's [autoresearch repository](https://github.com/karpathy/autoresearch) describes a bounded experimental loop: modify a limited part of a training setup, run a fixed-budget experiment, evaluate with a stable metric, then keep or discard the change. Its evaluation and data preparation are kept separate from the editable training code. The original project performs actual language-model training on a GPU.

LoopLab adapts the experimental discipline to **prompt comparison**. It does not train or fine-tune a model, run the autoresearch code, improve itself in the background, or claim endorsement by Karpathy. Its model does not learn from visitors' runs. A better score means that a prompt performed better on these examples in that run.

## A bounded experiment

1. **State one hypothesis.** For example: “Telling the extractor to exclude optional items will reduce supply errors.” Write this down before looking at new results.
2. **Keep the baseline.** Preserve prompt A exactly. Make one conceptual change in prompt B so the result is understandable.
3. **Lock the conditions.** Use the same model, shared system instruction, output schema, ten cases, answer keys, grading rules, generation settings, and run budget for both prompts. Record the experiment fingerprint as well as the corpus hash. The backend sends the announcement text to the model; answer keys are used by the grader, not supplied as model answers.
4. **Run both prompts.** A complete public comparison contains twenty model trials: ten per prompt. An error or missing trial is not a successful answer. A partial run cannot establish a winner.
5. **Inspect the evidence.** Compare complete-case passes and field matches. Open the failures: a plausible sentence, a reformatted date, or an invented location can still violate the stated contract.
6. **Record the result.** Save the exact prompts, model, corpus version and hash, experiment label and fingerprint, grader version, shared system instruction, run identifier, completion status, settings, observed scores, latency, token counts when reported, failures, and the decision. Use [the experiment template](../evals/EXPERIMENT-TEMPLATE.md). Missing usage is unknown, not zero; token counts are not a dollar invoice.
7. **Keep, reject, or mark inconclusive.** Keep a change only when the completed comparison supports the stated hypothesis and no previously passing case regresses. Reject regressions for this introductory workflow, even if an aggregate score rises. Label ties, incomplete runs, and mixed evidence inconclusive. A different acceptance policy must be declared before the next experiment.

For implementation work, use the same discipline: make one scoped change, run the relevant checks, review the result, and record the decision. Repairing a broken implementation is different from changing the benchmark to make a preferred answer pass.

## The fixed contract

The public corpus is `event-extraction-v1`, with exactly ten examples and this SHA-256 digest:

```text
9705d81a811312442125a487bf994201e34f9f14ace00c7342b274925cb0ea6c
```

The digest covers the canonical JSON of all case IDs, titles, categories, announcement text, expected answers, and notes. Object property order is fixed by `canonicalCorpusJson`; case and supply-array order are preserved, JSON has no extra whitespace or final newline, and the digest uses UTF-8. The offline harness independently pins the released version and digest. A digest identifies contents; it is not proof that the benchmark is comprehensive or tamper-proof against someone who can edit the whole repository.

Each answer must be one JSON object with exactly `location`, `date`, and `supplies`, with no duplicate keys, extra keys, Markdown fences, commentary, or automatic repairs. Location and date are strings of at most 200 Unicode characters or actual JSON `null`. Supplies is an array of up to eight non-empty strings of at most 200 Unicode characters each. Normalized duplicate supplies are invalid. Raw output is bounded at 32,768 JavaScript string code units.

The grader ignores letter case and whitespace differences. It preserves punctuation, numbers, and date wording. Supplies are compared as an unordered set. `null`, `"null"`, and an empty string are different values. Invalid JSON or schema fails all three fields. A correctly formatted answer gets one match per correct field, and a case passes only when all three fields match. Across ten cases, a lane has ten possible case passes and thirty possible field matches.

The cases include three straightforward invitations, missing dates and locations, an explicit correction, optional/negated/organizer-provided supplies, unresolved conflicting facts, a cancellation, and an embedded prompt-injection attempt. These are fictional examples with explicit answer keys, not private customer data.

## The experiment fingerprint

The corpus hash identifies the examples and their answer keys. A second, explicitly pinned SHA-256 fingerprint identifies the declared experiment setup in [`src/shared/experiment.ts`](../src/shared/experiment.ts):

```text
Experiment label: looplab-experiment-v1
Grader version: exact-fields-v1
Experiment fingerprint:
ca15419616ed60fc6a6b0ed3755087c348c5db8212fd0f6d45b2864a578f4b4b
```

The fingerprint hashes UTF-8 `JSON.stringify([MODEL, CORPUS_HASH, GRADER_VERSION, MODEL_SETTINGS, SYSTEM_PROMPT])`, with the array order and model-setting property order preserved. It includes:

- The exact hosted model identifier, `@cf/meta/llama-3.1-8b-instruct-fast`.
- The pinned corpus hash above, covering the ten cases and answer keys.
- The declared grader version, `exact-fields-v1`.
- Generation settings: `temperature: 0`, `seed: 42`, and `max_tokens: 256`.
- The exact shared system instruction, including its three-field output contract and treatment of announcements as untrusted data.

The friendly experiment label and corpus version are included in provenance, while their underlying setup and corpus hash determine the fingerprint. The editable A and B prompts are saved with each run instead of included in the setup fingerprint: those are the variables deliberately changed by an experiment.

The fingerprint is a reviewed literal, not a value silently accepted anew at runtime. Tests recompute it from the declared components and compare it with that literal. The public configuration exposes the provenance, health reports expose the fingerprint, and every stored run carries it as `experimentVersion`. The backend rejects reading, resuming, or idempotently reusing a saved run under an incompatible setup. Records remain stored; incompatibility does not delete them.

A changed system instruction, model setting, model identifier, or corpus therefore requires an intentional fingerprint update before release. A change to grading semantics also requires a reviewed grader-version update. The fingerprint includes that version label, **not a hash of every grader source byte**, so version discipline and code review are still necessary. It does not attest to a provider's hidden model weights or prevent a repository maintainer from editing both the code and its expected hash.

When reviewing an experiment, retain the exact exported run and its provenance together. Do not combine responses collected under different setup fingerprints into one A/B score. These controls establish which declared conditions were used; they do not establish that ten public examples adequately measure general model quality.

## Verification and honest limits

`npm run eval` runs the offline harness. It checks the frozen corpus and handwritten correct, incorrect, and malformed answers. It makes no AI calls and writes no result files. `npm test` also exercises the grader's parsing boundaries, actual-output preservation, duplicate keys, normalization, and resistance to instructions inside output, together with experiment-fingerprint checks and rejection of saved runs from an incompatible setup. These checks verify implementation behavior; they do not show that a live prompt improved.

The grader is deterministic and does not ask another model whether a response deserves credit. This keeps scoring independent of persuasive model text. It does not eliminate the human choices that define the task, answer keys, or metric. We do not alter those choices during a comparison.

Ten public cases are an educational benchmark, not a statistically strong claim about general AI reliability. Repeatedly tuning against them can overfit. A higher score does not establish general intelligence, security, business readiness, or consistent savings. Model responses and service latency can vary between runs; the same public model identifier may also change behind a provider's service.

For a stronger follow-up, an independent reviewer should prepare separate, unseen examples before prompt tuning. Record them under a distinct version, run them only after the prompt is selected, and report those results separately. The extra grader unit fixture is a code test, not a measured live-model generalization result. Do not silently add new examples to this version's public ten-case score.

If an answer key is genuinely wrong, report the defect and invalidate affected conclusions. Correct it in a reviewed new benchmark version, document what changed, and rerun both prompts. Never quietly move an answer key or loosen the grader to reward the preferred prompt.
