# LoopLab

**Stop guessing. Start testing.**

![Two illuminated test lanes inside LoopLab's miniature science-fiction laboratory](./public/looplab-lab.webp)

LoopLab lets you see whether changing an AI instruction actually improves its answers. Write two instructions, run both on the same ten fictional event announcements, and open any result to see what worked, what failed, and why.

The exercise is simple: find an event's confirmed location, date, and required supplies. Some announcements contain missing details, corrections, optional items, or conflicting information. The AI must handle those details accurately instead of filling in the blanks.

**[Open LoopLab ↗](https://looplab.recruiting-gains.workers.dev/)** — deployed to Cloudflare and verified with a complete live experiment on September 4, 2026. See the [release verification and actual results](./docs/RELEASE-VERIFICATION.md).

## Your first experiment

1. Keep the starter instruction in **A — Your baseline**.
2. Change one idea in **B — Your challenger**. For example, tell it to exclude optional supplies.
3. Select **Run experiment**. Each prompt receives the same ten announcements, producing twenty model responses in a complete run.
4. Open a test case to inspect the original announcement, the fixed answer key, both responses, and the field-by-field explanation.
5. Download the results. If the evidence supports your change, use **Use B as baseline** and test your next idea.

You can pause after the current case and resume. A refresh can restore the last run in the same tab while its session and access window remain valid. The history list covers completed experiments in the current page session; it is not a permanent account dashboard.

## What makes it useful

- **A visual experiment you can inspect.** An interactive Three.js laboratory shows two test lanes. Ordinary buttons, readable case cards, motion controls, and an illustrated fallback keep the experiment usable beyond the 3D scene.
- **The same conditions for both prompts.** The task, ten examples, model, output format, and generation settings stay fixed during a comparison.
- **A fixed checker.** Code compares the answer with a declared answer key. Another AI does not decide whether the tested AI deserves a pass.
- **Visible evidence.** Actual responses, field results, observed response times, service errors, and token counts when available appear in the interface and downloadable JSON.
- **A complete small application.** The project includes the frontend, backend, database migration, infrastructure configuration, tests, and deployment instructions.

## Which AI is doing what?

**Astra was used as a development assistant to help build and review LoopLab.** The deployed app's inference is separate: live experiments call **Cloudflare Workers AI**, using `@cf/meta/llama-3.1-8b-instruct-fast`.

Opening a LoopLab experiment does not run Astra and does not measure Astra's runtime performance. This project exercises Astra's engineering work; the experiment scores the configured Llama model's responses to the two prompts. Self-hosting uses your own Cloudflare account and its Workers AI allowance or billing.

Both lanes use the same system instruction and settings: temperature `0`, seed `42`, and a maximum of `256` generated tokens per response. Identical settings do not guarantee identical responses across runs or provider updates.

Results also retain the provider-reported model identifier when supplied. The configured model name is a provider alias; the underlying identifier may differ or change. The integration scores the original response text, not a provider-parsed object reconstructed into cleaner JSON.

Each run also carries a fixed experiment fingerprint. It identifies the model name, corpus contents, declared grader version, generation settings, and exact shared system instruction. This is more specific than recording the model name alone. The public configuration exposes those provenance details, and saved runs from a different setup cannot be reopened or resumed as current experiments. The two editable prompts are stored separately because they are the variables being tested. See [the full fingerprint definition](./docs/LOOP-METHOD.md#the-experiment-fingerprint).

## How results are checked

Each answer must contain exactly three JSON fields: `location`, `date`, and `supplies`. Missing or unconfirmed locations and dates must be actual JSON `null`. No required supplies means an empty array.

The grader ignores letter case and extra whitespace; supply order does not matter. It preserves numbers, punctuation, and date wording. Extra or duplicate fields, Markdown wrappers, invalid JSON, and incorrect values cannot quietly receive full credit. A case passes only when its format and all three fields pass.

Each prompt has ten possible case passes and thirty possible field matches. Service errors are reported separately and make the comparison incomplete. The app does not repair the model's answers, feed it the answer key, or silently retry a failed model trial.

The loop is inspired by the experimental discipline in Karpathy's autoresearch: keep a baseline, change one thing, evaluate under fixed conditions, inspect the evidence, then decide what to keep. LoopLab adapts that discipline to prompt comparison. It does not train model weights or learn from visitors in the background. Read [the full loop method](./docs/LOOP-METHOD.md), [evaluation evidence](./evals/README.md), and [the experiment record template](./evals/EXPERIMENT-TEMPLATE.md).

Ten public examples are a small educational exercise. A high score can reflect tuning to those examples. It does not establish general reliability, security, business readiness, or guaranteed token savings. Use separate unseen examples before making broader claims.

## Architecture

| Part | Implementation | Purpose |
| --- | --- | --- |
| Frontend | TypeScript, Vite, Three.js | Prompt editor, interactive laboratory, evidence dialogs, results export |
| Backend | Cloudflare Worker | Request validation, session ownership, experiment progression, AI calls |
| Storage | Cloudflare D1 | Prompts, experiment metadata, results, call reservations, daily limits |
| AI | Cloudflare Workers AI binding | Two bounded inference calls per test case |
| Grading | Shared TypeScript checker | Fixed parsing, format checks, and answer comparisons |
| Infrastructure | Wrangler configuration and SQL migration | Worker assets, database, AI and rate-limit bindings |
| Verification | Vitest, SQLite-backed Miniflare, offline evaluation harness | Grading, API boundaries, database constraints, and experiment behavior |

The browser calls the Worker. The Worker reserves a case in D1, requests the two model responses, grades them, and stores the results. Database constraints coordinate concurrent requests so a repeated step does not start extra model calls.

## Run your own copy

Use Node.js **22.12 or later in the 22.x line**, or **24.x**, with npm. Run the commands below inside this repository's `looplab` directory.

Install dependencies and run the local checks:

```sh
npm ci
npm run cf:typegen
npm run typecheck
npm test
npm run eval
```

`npm test` substitutes the AI service and edge rate limiter while using actual SQLite through Miniflare for the database tests. `npm run eval` checks the fixed corpus and handwritten grader controls. These checks do not call a live model and do not establish live prompt performance.

For the complete application, authenticate Wrangler to your Cloudflare account and set the account and database configuration as described in [Deployment](./docs/DEPLOYMENT.md). Then:

```sh
npm run db:local
npm run build
npm run dev:worker
```

Open [the local app](http://localhost:8787). The local database migration creates the development tables; it does not migrate the remote database.

**Local experiments use real AI.** The AI binding has `remote: true`, so clicking **Run experiment** during local development sends requests to Cloudflare Workers AI and can incur usage charges. No OpenAI or Anthropic API key is required. Cloudflare describes this behavior in its [Workers AI bindings documentation](https://developers.cloudflare.com/workers-ai/configuration/bindings/).

For frontend hot reloading, leave the Worker running and start a second terminal:

```sh
npm run dev
```

Open [the Vite development page](http://127.0.0.1:5173). Its `/api` requests are proxied to the local Worker. Running Vite alone does not provide the backend or live inference.

Run the complete release check with:

```sh
npm run check
```

This runs type checking, tests, offline evaluation, a frontend build, and a Worker deployment dry run. A successful dry run prepares the deployment bundle; it does not publish the app or prove live inference works.

With the local Worker running, you can check the interface in a real browser:

```sh
npx playwright install chromium
npm run test:browser
```

This browser check substitutes inference **inside the test browser only**. It exercises a complete comparison, failure inspection, export, prompt promotion, pause/start-fresh recovery, stale-deployment rejection, keyboard dialogs, reduced motion, mobile widths, and automated accessibility checks. The production app has no simulated-response mode.

To explicitly run one real comparison against your deployed installation:

```sh
LOOPLAB_TEST_URL=https://your-worker.your-subdomain.workers.dev npm run test:live -- --live
```

The live check consumes twenty model-call reservations and verifies actual responses, export provenance, refresh recovery, and session isolation. Browser artifacts remain in ignored `test-results/`. Set `LOOPLAB_BROWSER_CHANNEL=chrome` to use an already-installed Chrome instead of Playwright's browser download.

The repository's [LoopLab checks workflow](../.github/workflows/looplab.yml) runs `npm ci` and `npm run check` on Node.js 24 for pushes and pull requests that change LoopLab or its workflow. It uses read-only repository permissions and no deployment secrets. The automated check makes no live model calls and does not publish a Worker.

## Deploy to Cloudflare

[Follow the deployment guide](./docs/DEPLOYMENT.md) to select or create the correct D1 database, apply the migration, publish the Worker, and verify its public URL. Cloudflare supplies a `workers.dev` address, so a purchased domain is optional.

The public showcase installation is a limited tool. You can also use the source as a template for your own deployment. The MIT source license does not provide free or unlimited hosted inference.

## Data and limits

Use the supplied fictional announcements and avoid entering personal information, credentials, or confidential material in your prompts. The prompts are sent to Cloudflare Workers AI. D1 stores both prompts, model responses, scores, timing and available token counts, model and corpus identifiers, and experiment timestamps.

An `HttpOnly` browser cookie identifies the session; the database stores its hash. Production cookies also use `Secure` and `SameSite=Strict`. The current tab stores a run ID for refresh recovery. Knowing a run ID alone does not grant access through the API.

Experiment access expires **24 hours after creation**. Expiry denies access; it does **not** automatically delete database records. Records remain until the owner performs authorized maintenance. There is no automatic deletion job in this release.

The shipped configuration limits new experiments to **four per browser session per UTC day** and **100 site-wide per UTC day**. A separate database-enforced allowance caps model-call reservations at **2,000 per UTC day**, including work resumed from older runs. One full experiment uses twenty model-call reservations. Failed or interrupted attempts still consume their reservation. Limits do not promise an exact dollar spending cap, and browser-session limits are not verified person limits.

The Worker also applies request-rate limits, same-origin checks, bounded inputs and responses, session ownership checks, and restrictive response headers. These are implemented controls, not a formal security certification. See [Deployment](./docs/DEPLOYMENT.md) for operational details.

## Project map

```text
src/client/       Interface, laboratory scene, and result summaries
src/worker/       API, session boundaries, storage, and inference
src/shared/       Contracts, ten fixed cases, and deterministic grading
migrations/      D1 schema and atomic quota controls
tests/           Grader and SQLite-backed Worker tests
evals/           Offline controls and experiment record template
docs/            Method, deployment, and artwork provenance
public/          Original lab artwork, fonts, icon, and site metadata
wrangler.jsonc   Cloudflare bindings and deployment configuration
```

## License and credits

LoopLab is an independent project by Cruz for [AI Builds Showcase](https://github.com/recruiting-gains/ai-builds-showcase). It is not affiliated with or endorsed by OpenAI, Anthropic, Meta, Cloudflare, or Andrej Karpathy.

Project code is covered by the parent repository's [MIT license](../LICENSE). Dependencies and bundled fonts retain their own licenses. The original laboratory artwork and its creation prompt are documented in [Asset Notes](./docs/ASSET-NOTES.md).
