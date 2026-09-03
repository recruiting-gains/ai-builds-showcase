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

```bash
vercel --prod
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
