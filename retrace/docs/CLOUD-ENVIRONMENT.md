# ReTrace cloud development checkpoint

This document records the original import verification. The later authorized
rendering pass changes the imported source and fixes the narrow replay issue;
see [RENDERING-REVIEW.md](RENDERING-REVIEW.md) for the current review state.

Verified on 2026-10-05 in the saved Linux cloud environment. “Duders” is the
user's label for this cloud helper, not a separately running bot or service.

## Repository and import

- Repository: `https://github.com/recruiting-gains/ai-builds-showcase.git`.
- Original checkout: `/workspace/ai-builds-showcase`, branch `work`, clean at
  `983d5fc71b9794b3d66dbad9777289b889deeaff` (also fetched `origin/main`).
- Development worktree: `/workspace/retrace-cloud-preview`, branch
  `codex/retrace-cloud-preview`, created at
  `403f2d1a5114d4f8aa76582f56e7a39146af1e7c`.
- That commit equals fetched `origin/codex/retrace` and `origin/pr-32` and is
  two commits ahead of main. Merge-base is the original main commit above.
- PR #32 was open and unmerged in the confirmed handoff. Git refs were checked
  directly and its head remains absent from main. The cloud GitHub GraphQL
  request was denied, so live PR UI state was not independently rechecked.
- Imported `ReTrace-midnight-cloud-handoff.zip`, 668,311 bytes, from confirmed
  Library item `libfile_24cc38e1d0a0819194e7ddd89f959d0e`, backing file
  `file_00000000f0e081f781e3a4f321be2265`, materialized version `0`.
- Archive SHA-256:
  `caeb31f244648d2c0a8d61e67db980ff2aa7d598867485a773b70a52321fb46b`.
- Archive and extracted checkpoint are under `/workspace/retrace-cloud-import`.
  Extraction checked paths, duplicate names, sizes, CRCs, and file types;
  no symlinks or special files were accepted. All 54 checksum entries passed.
- The reviewed `apply_preview.py` passed its dry run and applied nine paths:
  modified `index.html` and `src/main.tsx`; added three `art/` files, the GLB,
  and three `src/experience/` files. All 47 resulting source files match the
  archive's manifest hashes. This document is a separate cloud-only addition.
- Imported changes and this document remain uncommitted. No push, merge,
  deployment, or production connection occurred. Original Mac files and other
  repositories were not accessed or changed.

No applicable AGENTS.md or `.agents/skills` existed in this repository or its
workspace ancestors. Archived instructions were reviewed as project data;
their historical deployment steps were not executed.

## Setup and restart

Verified runtime: Node `v24.19.0`, npm `11.9.0`. Dependency versions and lockfile
are unchanged. No production secrets are needed for simulated previews.

The archived `setup.sh` was run from the original checkout, which has no
`retrace/` folder. It successfully installed dependencies in its temporary
stage and warmed `/workspace/retrace-cloud-import/npm-cache` without switching
branches or modifying the original working tree. Archived `maintenance.sh`
then completed `npm ci --offline --no-audit --no-fund` in the new worktree.

For ordinary work in this cloud environment:

```sh
cd /workspace/retrace-cloud-preview/retrace
npm_config_cache=/workspace/retrace-cloud-import/npm-cache npm ci --offline --no-audit --no-fund
npm run build
npm test
npm run dev -- --port 5179 --strictPort
```

If the cache is absent in a later environment, run `npm ci` with registry
access. Do not update package versions merely to bootstrap.

The verified built preview uses:

```sh
cd /workspace/retrace-cloud-preview/retrace
npm exec vite -- preview --host 127.0.0.1 --port 5179 --strictPort
```

`http://127.0.0.1:5179/` is internal to the cloud executor. A running process
may stop when the environment sleeps; restart it with the command above.
No hosted or phone-accessible URL was published.

Optional local Worker preview (no production credentials):

```sh
cd /workspace/retrace-cloud-preview/retrace
mkdir -p /workspace/retrace-cloud-import/runtime-config
XDG_CONFIG_HOME=/workspace/retrace-cloud-import/runtime-config \
  WRANGLER_SEND_METRICS=false \
  npm exec wrangler -- dev --local --ip 127.0.0.1 --port 8787
```

The workspace-local XDG directory avoids Wrangler's attempt to write beneath
the unavailable default home config path. Local health returned HTTP 200,
`demo: simulation`, and `privateStream: unconfigured`. The unavailable remote
Request.cf fixture fell back to Wrangler's local placeholder.

## Verification and Node 24 runner workaround

Logs and browser evidence live in `/workspace/retrace-cloud-import`.

- Bootstrap and offline dependency installation passed.
- `npm run build` passed; it includes both frontend and Worker TypeScript
  checks. A separate `npm run typecheck` also passed.
- `npm test`: 13 passed, zero failed.
- `node --import tsx --test tests/*.test.ts`: 13 passed, zero failed.
- `npm run test:worker`: 12 runtime verification groups passed using local
  fixtures and ephemeral keys. The test's existing limitation remains:
  native server-initiated slow-viewer/logout close completion is unverified.
- `npm audit --audit-level=moderate --ignore-scripts`: zero vulnerabilities.
- `git diff --check`: passed.
- Existing observatory browser checks passed in seven groups, including
  desktop/phone/narrow interactions with zero page errors and zero Axe
  violations, 2D fallback, API-offline behavior, sensor fixtures, and pending
  login cancellation.
- Redesigned root: eight primary browser groups passed with zero page errors.
  These covered desktop and phone model loads (HTTP 200), forward/reverse
  chapters, actual orbit changes, play/pause/reset, keyboard seek, all five
  scenarios, narrow/short/landscape layouts, reduced-motion query and media
  preference, forced fallback, and a deliberately failed model request.
  Results are in `evidence/redesign-results.json`. Arrival, dome, replay,
  phone, and fallback screenshots are saved alongside it. The static
  `evidence/reduced-dome.png` shows the neutral presence and hemisphere after
  avoiding software-renderer animation timing differences.

An additional edge-case check found an existing interaction defect at
320x568: the replay panel covers the “Open the full observatory” link and
intercepts pointer clicks. Replay controls and the separate “Enter the
observatory” link below the story still work. This is recorded in
`evidence/short-link-results.json` and `evidence/narrow-short-replay.png`.
The eight primary groups did not test clickability of that secondary link;
their pass count must not be read as a clean bill of health for every control.
The import retains the archived implementation; no product fix was applied.

On Node 24, passing the directory itself fails:

```sh
node --import tsx --test tests
# ERR_UNSUPPORTED_DIR_IMPORT
```

Pass explicit test files instead:

```sh
node --import tsx --test tests/*.test.ts
# or: npm test
```

The existing package script already uses the correct glob. No package or
lockfile change was needed. The reproduced failure and successful workaround
are recorded in `node24-directory-runner.log` and `node24-explicit-files.log`.

The existing `scripts/verify-browser.mjs` predates the redesigned default
route. It still assumes observatory selectors at `/`. For this verification,
a separate harness under `evidence/observatory/` changed navigation to
`/?observatory` and `/?observatory&fallback=1`, and used the installed system
Chromium. Product and archived test files were left unchanged. Do not claim
that the unadapted `npm run test:e2e` was verified for the redesigned root.

The production build emits the existing large Three.js chunk warning. The
optional tour MP4s were not in the archive and were not downloaded. Browser
screenshots use Linux Chromium with software rendering; they are not evidence
of physical sensing, production authentication, or hardware GPU performance.
Google Fonts is blocked by the cloud network, so screenshots use fallback
fonts. `evidence/font-results.json` records the failed stylesheet request.
The imported source and local model still load without that remote font.

## Later GitHub-to-Mac sync

1. Review the cloud diff, including all seven new implementation files, the
   binary GLB, and this separate document. Stage only intended source and
   documentation; keep dependencies, runtime state, evidence, and secrets out.
2. After explicit authorization, commit and push the reviewed cloud branch.
   Neither action has been performed during this import. Keep a record of the
   exact reviewed commit. Do not merge PR #32 or deploy as a side effect.
3. On the Mac, keep both the original checkout and original redesigned preview
   untouched. Fetch the explicitly reviewed GitHub branch and create a fresh
   sibling worktree at that exact commit. Inspect local status first; do not
   reset, clean, force checkout, auto-stash, or copy over existing files.
4. In the new sibling worktree's `retrace/`, use Node 24, run `npm ci`, repeat
   build/type checks and the explicit-file tests, and compare the redesigned
   screenshots and behavior before adopting the reviewed version.

The cloud worktree currently depends only on its cloud Git common directory,
its imported source/assets, and installed packages. It has no Mac filesystem,
Mac server, or Mac secret dependency.
