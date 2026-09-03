# ChatGPT Ads — The Paid-Ads Operating System

A full-stack Next.js 14 (App Router) + TypeScript + Tailwind CSS landing page and live demo tool that audits ad campaign data — **no AI API keys required**. All auditing logic runs on a deterministic, real-math engine (`lib/auditor.ts`).

## Features

- Landing page with hero, social proof, problem/solution, how-it-works, features grid, live demo, example results, FAQ, and final CTA.
- **Live Demo Tool**: upload a CSV or paste campaign data (Google, Meta, TikTok, or LinkedIn) and get an instant audit.
- **Real audit engine** (no external AI calls):
  - Computes total spend, average ROAS/CTR/CPC.
  - Flags **wasted spend**: ROAS < 1.2x with spend > $100, CTR < 0.8%, or CPC > $3.
  - Surfaces **top 3 winning ads** by ROAS.
  - Generates a 5-step **optimization plan** based on the data.
- Fully responsive, beige (`#FFFBF0`) background with dark green (`#0F2D1F`) text.
- Vercel-ready, zero environment variables.

## Getting Started

```bash
./setup.sh        # npm install + npm run build
npm run dev        # start local dev server on http://localhost:3000
```

## Deploy

### Vercel

```bash
vercel --prod
```

### Cloudflare Pages

This app can also be deployed to Cloudflare Pages via [`@cloudflare/next-on-pages`](https://github.com/cloudflare/next-on-pages), without affecting the Vercel deployment above.

`wrangler.toml` in this directory codifies the build output directory and the `nodejs_compat` compatibility flag, so connecting this repo to Cloudflare Pages' Git integration mostly just works — no manual flag toggling required in the dashboard. In Cloudflare Pages project settings, set:

| Setting | Value |
| --- | --- |
| Root directory | `chatgpt-ads` |
| Build command | `npx @cloudflare/next-on-pages@1` |
| Build output directory | `.vercel/output/static` |
| Compatibility flag | `nodejs_compat` (also set via `wrangler.toml`) |

Once connected, every push to `main` triggers a production deploy and every branch/PR push gets its own preview deploy automatically — same as Vercel's Git integration.

You can also build locally with:

```bash
npm run pages:build
```

## Project Structure

```
chatgpt-ads/
  app/
    page.tsx              # Landing page
    layout.tsx
    globals.css
    api/
      audit/route.ts      # POST { platform, data } -> audit result
      upload/route.ts      # Parses uploaded CSV with papaparse
  components/
    Hero.tsx
    Features.tsx
    HowItWorks.tsx
    AuditTool.tsx
    Results.tsx
    FAQ.tsx
  lib/
    auditor.ts             # Real audit engine (no AI keys)
  vercel.json
  setup.sh
```

## API

### `POST /api/audit`

```json
{ "platform": "Meta Ads", "data": [{ "name": "Summer Sale", "spend": 450, "clicks": 120, "impressions": 15000, "conversions": 8 }] }
```

Returns `{ totalSpend, avgRoas, avgCtr, avgCpc, wastedSpend, winningAds, optimizationPlan, summary }`.

### `POST /api/upload`

Accepts `multipart/form-data` with a `file` field (CSV) and returns parsed rows for use with `/api/audit`.

No environment variables or API keys are required anywhere in this project.
