# Deploying LoopLab

LoopLab runs as one Cloudflare Worker serving the built website and API, with a D1 database and a Workers AI binding. A Cloudflare-provided `workers.dev` address is sufficient; buying a domain is optional.

**Showcase deployment verified September 4, 2026:** [looplab.recruiting-gains.workers.dev](https://looplab.recruiting-gains.workers.dev/). A complete live browser experiment, export, refresh recovery, and session-isolation checks passed. Read the [release evidence](./RELEASE-VERIFICATION.md). Complete the checks below for your own installation.

## 1. Prepare the account and local project

Use Node.js 22.12 or later in the 22.x line, or 24.x, with npm. Work from the `looplab` directory:

```sh
npm ci
npx wrangler whoami
```

If Wrangler is not authenticated to the intended account:

```sh
npx wrangler login
```

Confirm the destination account before changing resources. In `wrangler.jsonc`, replace the showcase `account_id` with your own account ID. Choose a Worker `name` that belongs to this installation; deploying to an existing Worker name updates that Worker.

This version uses a Workers AI binding rather than an application API key. Do not commit Cloudflare API tokens, session cookies, `.dev.vars` contents, or credentials to the repository. Account and database IDs identify infrastructure and are not API secrets, but must point to the intended deployment.

## 2. Resolve the database before creating one

Inspect the account's existing databases:

```sh
npx wrangler d1 list
```

If `looplab-db` already exists for this installation, use its database ID. Verify it belongs to LoopLab before applying the migration; a matching name is not permission to repurpose someone else's data.

**Only if the intended LoopLab database does not exist**, create it:

```sh
npx wrangler d1 create looplab-db
```

Copy the returned database ID into the `DB` binding's `database_id` in `wrangler.jsonc`, replacing the placeholder or the original deployment's ID. Keep `binding: "DB"` and `migrations_dir: "./migrations"`.

The supplied package scripts target `looplab-db`. If your installation uses a different database name, update both `database_name` and the database names in the `db:local` and `db:remote` scripts. Cloudflare documents these operations in its [D1 Wrangler command reference](https://developers.cloudflare.com/d1/wrangler-commands/).

## 3. Verify locally

```sh
npm run cf:typegen
npm run db:local
npm run check
npm run dev:worker
```

Open [the local Worker](http://localhost:8787). `npm run check` builds the static assets before the development server starts. The `/api/health` endpoint should report `status: "ok"`, `database: "ready"`, the configured model, and the corpus version and hash.

`npm test` uses mocked AI responses and the actual migration, constraints, and triggers through a SQLite-backed Miniflare database. The grading harness and automated tests do not invoke the live AI service. They verify the implementation, not model quality.

The `AI` binding deliberately has `remote: true`. A browser experiment in local development therefore calls real Workers AI and uses the authenticated account's allowance or billing. The D1 development database remains local when using the provided local command. See [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/) for the provider's development behavior.

You can inspect the cases and run offline checks without executing a browser experiment. Do not use fabricated test responses as evidence of a live run.

## 4. Apply the remote migration and deploy

Review both SQL files in `migrations/`, the resolved account ID, database ID, Worker name, and limits. The first migration creates the tables and quota triggers; the second stores the full experiment fingerprint. Applying them targets the selected remote database:

```sh
npm run db:remote
npm run deploy
```

`npm run deploy` builds the frontend and publishes the Worker with its static assets and configured bindings. Save the actual URL reported by Wrangler; a different account or Worker name produces a different URL.

Update the canonical URL, Open Graph URLs, `public/sitemap.xml`, and README links to match your installation. The artwork path remains `/looplab-lab.webp` when served from the site's root. Rebuild and deploy after those changes.

## 5. Verify the deployed application

Use the actual deployed address for these checks:

1. Open the homepage on desktop and a phone-sized viewport. Confirm the artwork and experiment controls load, and that the interface remains usable with animation paused or WebGL unavailable.
2. Open `/api/health`. Check the expected database-ready response, model, and corpus identifiers. This is a database-readiness check; it does not call Workers AI.
3. Open `/api/config` or load the homepage normally. Confirm the ten cases load and the browser receives its session cookie. This endpoint does not call Workers AI either.
4. Run one complete experiment with the starter prompts. This makes live model requests and consumes the installation's allowance. Check all ten cases for both lanes; a higher score for either prompt is not required for the application to work.
5. Open individual results and download the JSON. Confirm the raw responses, answer keys, field explanations, model identity, and version information agree. Preserve service failures as failures; do not manufacture missing results.
6. Refresh the same tab and confirm its last run is restored while still accessible. In a different browser session, confirm that a copied run ID does not expose the original session's results.

Record the deployment URL and verification date only after those observations. A build, deployment dry run, successful publish message, or healthy database endpoint alone does not prove end-to-end live inference works.

## Limits, concurrency, and usage

The default configuration reserves capacity before inference:

| Limit | Shipped setting | Enforced by |
| --- | --- | --- |
| Prompt length | 1,600 JavaScript string units per prompt | Browser and Worker validation |
| New runs per session | 4 per UTC day | D1 trigger |
| New runs across the installation | 100 per UTC day | D1 trigger |
| Model-call reservations | 2,000 per UTC day | D1 trigger, including older resumed runs |
| Calls per complete comparison | 20 | Ten cases, two lanes |
| Generated response allowance | 256 tokens per model call | Shared inference settings |
| Create request rate | 6 per 60 seconds per IP digest | Cloudflare rate-limit binding |
| Step request rate | 60 per 60 seconds per IP digest | Cloudflare rate-limit binding |

The session limit counts browser sessions, not verified individuals. Edge rate limits are additional traffic controls; the D1 constraints enforce the shared daily reservations. These controls do not guarantee an exact financial cap. Monitor the account's actual Workers, D1, and Workers AI usage.

A case reserves its two attempts before the calls begin. A database claim and unique key prevent repeated or concurrent requests from starting that case again. Model calls have a 20-second application timeout. A pending case left unsettled for 60 seconds is marked interrupted when resumed, and is not automatically rerun. Timeout and service failures still consume reserved attempts; a timeout does not prove the provider performed no work.

Pause takes effect after the current case. Resume continues the stored experiment with the same prompts. If the released model, corpus, declared grader version, settings, or shared system prompt changes, the experiment fingerprint changes. Incompatible runs cannot be read, resumed, or reused through an old creation key; start a new comparison under the new version. Stored history is not deleted.

## Stored information and retention

D1 stores prompts, raw model responses, scores, observed timing, available usage counts, model and corpus identifiers, timestamps, run identifiers, and a hash of the browser session token. The browser receives an `HttpOnly` session cookie; production uses `Secure`, `SameSite=Strict`, and the `__Host-` cookie prefix. A tab stores only its last run ID in `sessionStorage` for recovery. The in-page history list is not a permanent account history.

The API denies access 24 hours after a run is created. The cookie also has a 24-hour lifetime. **Expiry does not delete records.** This release contains no scheduled cleanup process. Data remains in D1 until the owner performs authorized maintenance under an explicit retention policy.

Keep prompts fictional and free of confidential or personal information. Application error logs record limited event metadata and request IDs rather than prompt text or raw provider errors. The host still processes requests under its own platform behavior and terms.

Do not delete current quota records to reset a public allowance. Retention work should preserve the active day's accounting and respect database relationships. Plan and review any cleanup or schema change before applying it.

## Operations and troubleshooting

| Symptom | Check |
| --- | --- |
| Website loads but database is not ready | Confirm the correct D1 binding and apply the migration to the same environment being served. |
| Local AI cannot connect | Confirm Wrangler authentication and Workers AI access in the selected account; inspect actual provider status and account usage. |
| Too many requests or daily allowance reached | Wait for the applicable short rate window or UTC-day allowance. Do not automatically create new sessions or reset accounting to bypass it. |
| A run seems interrupted | Resume to retrieve saved results. An interrupted case remains visible as an error rather than silently consuming another model call. |
| Session or experiment unavailable | Use the original browser session and tab while its access window remains valid. Cookie loss and expiry can require a fresh run. |
| Model or corpus version conflict | Start a new experiment so both lanes use the currently deployed conditions. |
| 3D view unavailable | Use the illustrated fallback and the ordinary experiment controls; inspect browser/WebGL errors separately. |

Before a future release, keep a record of the currently deployed Worker version and review whether its database schema remains compatible. Reverting Worker code does not automatically reverse a D1 migration. For schema changes, prepare an appropriate backup and recovery plan using the account's available D1 recovery tools. Do not delete a database, deployment, or history as a troubleshooting shortcut.

LoopLab includes practical request, ownership, and resource controls. It has not been formally certified for security or deployed as a multi-tenant enterprise service. The public version is a bounded portfolio tool, and the source is a starting point for reviewed self-hosting.
