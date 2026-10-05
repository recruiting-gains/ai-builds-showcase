# ReTrace cloud releases

This pipeline builds a reviewed Git commit on GitHub-hosted Linux runners, uploads its assets and Worker through Wrangler, and can promote the resulting version through Cloudflare's deployment API. A Mac does not participate in that path.

The implementation is [`.github/workflows/retrace-release.yml`](../../.github/workflows/retrace-release.yml), with trusted release code in [`scripts/release`](../scripts/release). Initial read-only inspection found no configured Cloudflare Workers Builds integration for `retrace` to reuse. This manual GitHub Actions workflow is the proposed durable route; it does not establish a native Builds connection or enable automatic deployments.

## Current activation state

Source changes can be reviewed in a draft PR. This document does not mean that the workflow is active, that its credentials exist, or that an end-to-end cloud release has passed. No new release token has been created. Activation and authenticated acceptance remain blocked on the approved workflow/application reaching the default branch and the user completing the secure environment/token setup below.

The current production release is being handled separately by the existing Mac release task. Do not run this pipeline against production while that work is in progress. Read the live deployment after it finishes; a version UUID in an earlier handoff is not an authoritative current baseline.

## Manual release modes

The only trigger is `workflow_dispatch`. Pushes, pull requests, and schedules do not start this release workflow. It defaults to `verify`.

| Mode | Cloudflare effect | Required inputs |
| --- | --- | --- |
| `verify` | None; build, tests, browser checks, and artifact packaging only | Full reviewed `commit_sha` |
| `upload` | Uploads a new version and its assets; verifies production traffic is unchanged | Reviewed `commit_sha` and freshly read `expected_production_version` |
| `production` | Uploads the tested artifact, then sends 100% traffic to that exact new version and checks the live website | Reviewed `commit_sha`, freshly read `expected_production_version`, and explicit authorization for this production release |

Every run must use workflow branch `main`. The input must be a full lowercase 40-character commit SHA, and the checked-out source must equal that SHA and be an ancestor of `origin/main`. The release controller comes from the trusted workflow checkout, separately from the selected application source. These checks bind a run to reviewed repository history; they do not replace code review or authorize publishing an arbitrary old commit.

Both mutation modes perform their own build and upload. A later `production` run does not automatically reuse the version UUID from an earlier `upload` run. Review the commit and artifact evidence for each run.

GitHub requires the workflow file on the repository's default branch before manual dispatch is available. Review and land the necessary source/workflow changes through the normal approved merge process first; publishing this draft PR alone does not activate dispatch. [GitHub manual workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## One-time secure setup

After explicit approval for this persistent deployment credential and its scope, the user completes the following setup directly in GitHub and Cloudflare. No Mac OAuth token, browser cookie, connector credential, or application secret is copied into CI.

1. In repository **Settings → Environments**, create/configure `retrace-production`. Restrict its deployment branch rules to the branch `main`, with no tag rule. Add a required reviewer if the current repository plan supports it. Do not buy an upgrade to obtain a reviewer rule. If environment secrets or branch restrictions themselves are unavailable, leave mutation modes inactive and report that specific limitation instead of moving the token to an unprotected repository secret.
2. In Cloudflare account `3058ec0673db0768c53a7991b701ff3b`, open **Manage account → Account API tokens → Create Token**. Create an account-owned token named `ReTrace GitHub releases`, with **Workers Editor scoped only to the existing individual Worker `retrace`**. Review the permission summary before creating it. Do not substitute Workers Admin, all-Workers scope, or the legacy account-wide Workers Scripts Edit permission if the granular option is missing; report the mismatch first.
3. Copy the token directly from Cloudflare into **Environment secrets → Add secret** for `retrace-production`, named `CLOUDFLARE_API_TOKEN`. Never paste it into chat, a workflow input, a source file, or an artifact. The workflow already fixes `CLOUDFLARE_ACCOUNT_ID` to the account above.

GitHub gates environment secrets behind the environment's configured protection rules. Reviewer availability depends on the existing plan and repository visibility; no reviewer rule is assumed until it has been configured and checked. [GitHub environment setup and availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Cloudflare supports account-owned tokens for durable integrations. Creating one requires the user's existing Super Administrator or API Token Provisioning capability; that capability is not granted to the CI token. [Account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)

Worker-scoped Editor permits updating an existing Worker, its versions, deployments, and bindings. This route requests no Account Settings, User Memberships, DNS, route, or separate Durable Objects permission. The explicit account ID avoids Wrangler's account discovery; existing routes and domains are preserved. No new Worker, storage namespace, or migration is provisioned. [Granular Wrangler authorization](https://developers.cloudflare.com/workers/authorization/#use-granular-permissions-with-wrangler), [Workers roles](https://developers.cloudflare.com/workers/authorization/workers/), [Durable Objects roles](https://developers.cloudflare.com/workers/authorization/durable-objects/)

## What the release preserves and verifies

The trusted [`policy.mjs`](../scripts/release/policy.mjs) fixes the deployment destination and storage identity:

| Policy | Required value |
| --- | --- |
| Repository / workflow branch | `recruiting-gains/ai-builds-showcase` / `main` |
| Cloudflare account / Worker | `3058ec0673db0768c53a7991b701ff3b` / `retrace` |
| Production URL | `https://retrace.recruiting-gains.workers.dev` |
| Durable Object binding / class | `SIGNAL_ROOM` / `SignalRoom` |
| Existing namespace | `6a248445ad03426b97d191db59649568` |
| Existing migration tag | `v1` |
| Compatibility date | `2026-10-04` |
| Required existing secret bindings | `INGEST_SECRET`, `SESSION_SECRET`, `VIEWER_SECRET` |

The application Wrangler configuration must match the reviewed hash in the policy. Runtime bindings are checked before upload and compared with the uploaded version; unexpected storage identity, missing secret bindings, additional resource types, or migration changes stop promotion. Binding metadata does not prove equality of secret values. The workflow does not retrieve those values; Wrangler inherits unchanged secrets.

The credential-free job installs lockfile dependencies without lifecycle scripts, checks dependencies and TypeScript, runs unit/Worker/browser tests, fetches the existing tour videos, and builds the site. Both existing MP4 filenames, sizes, and hashes are pinned in the trusted policy as well as [`public/media/manifest.json`](../public/media/manifest.json); missing bytes or a removed manifest entry fails packaging. Changing either video requires explicit policy review. The resulting assets, bundled Worker, and fixed release configuration are hashed. The credentialed job checks the artifact against the build job's digest before uploading; it does not rebuild the selected source with the token present.

Wrangler 4.147.0 uploads the prebuilt Worker using `versions upload --no-bundle --keep-vars --strict`, with the commit in `workers/tag`. `--keep-vars` retains existing plain/JSON variables; unchanged secrets are inherited by Wrangler. Other resource bindings are governed by the explicit policy. A pending Durable Object migration must fail rather than trigger an automatic fallback to `wrangler deploy`. [Wrangler version commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/#versions-upload)

The version ID comes from a fresh `WRANGLER_OUTPUT_FILE_PATH` NDJSON file and is verified against the version API. Human log text is not parsed for release identity. [Wrangler structured output](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/#supported-environment-variables)

For production, the controller uses only the official `POST /accounts/{account}/workers/scripts/retrace/deployments` operation with the verified version at 100%. It does not invoke Wrangler's additional settings synchronization or a trigger update. This preserves the existing non-versioned observability, tails, logpush, routes, and domains. [Cloudflare deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/)

An upload is not a promise of a usable preview website for this Durable Object Worker. Do not invent a version URL or treat an upload-only success as a production website verification. [Version URL limitations](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/#limitations) Production checks compare served assets with the reviewed artifact, check the API/private-interface configuration, and exercise the actual desktop/mobile router scene and replay. The site remains an explicitly simulated concept.

## Acceptance with the Mac off

After the approved changes reach `main` and the separate current release has finished:

1. Stop relying on the Mac for builds or authentication. In GitHub **Actions → ReTrace cloud release → Run workflow**, select branch `main`, the reviewed full commit SHA, and mode `verify`. Confirm the full validation job and artifact upload succeed on the GitHub-hosted runner without Cloudflare credentials.
2. Read ReTrace's current live deployment through its Worker-specific deployment endpoint. Record the version currently receiving 100% of traffic. With the environment credential configured and the upload test authorized, dispatch `upload` for the same reviewed commit and supply that fresh version UUID. Confirm a new version/asset upload succeeds, its commit/bindings match, and the deployment ID and production traffic remain unchanged. This validates the cloud transfer path that was unavailable from the earlier executor.
3. Review that evidence and obtain separate authorization for the production acceptance release. Read the current deployment again, then dispatch `production` with the reviewed commit and current version UUID. Approve the environment job if a reviewer rule is configured. Confirm the new deployment serves the uploaded version at 100%, all public asset checks pass, and the desktop/mobile evidence shows the router-origin scene and usable replay.

Keep the workflow run URLs, reviewed commit, artifact digest, uploaded version, deployment ID, previous version, and browser evidence together. Only after these stages pass is the cloud-only path demonstrated end to end. No static UUID in this document is a current production version.

## Failure handling and rollback

Runs are serialized without canceling an in-flight release. The controller refuses to promote when the expected production version or deployment changes during upload. Other deployment tools are outside this GitHub concurrency group, so coordinate with them and always re-read live state.

There is no automatic promotion retry, forced deployment, or automatic rollback. Wrangler can internally retry version uploads; the workflow does not automatically rerun the full release. A timeout or failed process after a mutation may still mean Cloudflare accepted it. Promotion intent and its target version are saved before the traffic-changing request. Inspect the saved report/NDJSON and the current deployment/version API before starting another run. A failed live website check means the new version may already be serving traffic; it does not mean production is unchanged.

The release evidence records the previous deployment and version in `release-report.json` and `rollback.txt`. Any rollback requires an explicit decision, a fresh state check, and verification that the recorded version is still appropriate. Repointing traffic does not restore Durable Object data. [Cloudflare rollback behavior](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

## Applying the pattern to another project

Reuse the separation of credential-free verification, hashed artifacts, protected manual release, and explicit traffic promotion. Create a separately reviewed per-Worker policy, storage/media checks, environment, token scope, and acceptance plan for each project. Do not turn the ReTrace policy into a free-form Worker/account input or expand this token to other products. Native Workers Builds can be reconsidered if a suitable connection is later configured, but must not silently introduce automatic publication.
