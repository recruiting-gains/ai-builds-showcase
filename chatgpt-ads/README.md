# ChatGPT Ads

ChatGPT Ads is a transparent campaign health-check tool that recognizes common Google, Meta, TikTok, and LinkedIn ad-export columns.

**Live app:** <https://chatgpt-ads.recruiting-gains.workers.dev/>

Upload a CSV or paste a campaign table. The app calculates overall performance, identifies campaign spend that needs review, finds campaigns that clear every winner guardrail, and returns a practical five-step checklist.

Despite the project name, this version does **not** call ChatGPT or another AI model. It uses deterministic calculations and clearly stated thresholds, so the same input always produces the same result. It is an independent portfolio project and is not affiliated with OpenAI or any advertising platform.

## What it checks

- Total spend, clicks, impressions, and conversions
- Spend-weighted ROAS
- Overall CTR calculated from total clicks and impressions
- Overall CPC calculated from total spend and clicks
- Campaigns that need review because ROAS is missing or below `1.2x` on more than `$100`, CTR is below `0.8%`, or CPC is above `$3`
- Up to three qualified winners with ROAS of at least `2x` that are not flagged by any other guardrail
- A five-step review checklist based on the submitted numbers

“Spend at risk” means the complete spend associated with a campaign that crossed at least one review rule. It is not a claim that every flagged dollar was lost. Results are an educational first pass, not financial advice.

## Privacy and limits

- No account, ad-platform login, API key, database, or campaign-history storage
- Submitted data is processed in memory by the Cloudflare Worker and is not sent to an AI provider
- CSV files must be `512 KB` or smaller
- Requests are limited to `500` rows, `40` columns per row, and bounded cell sizes
- Invalid platforms, nested input, incorrect file types, and oversized requests are rejected
- API responses are not cached

Avoid submitting personal information, credentials, or secrets. Standard hosting security and operational metadata may still be handled by Cloudflare as the infrastructure provider.

## Architecture

```text
Browser
  ├─ Next.js landing page and accessible campaign form
  ├─ CSV upload or pasted table
  └─ Results rendered from validated JSON
           │
           ▼
Cloudflare Worker (OpenNext)
  ├─ validates request type and size
  ├─ validates platform, rows, columns, and cells
  ├─ parses CSV and common campaign column aliases
  ├─ computes deterministic campaign metrics and guardrails
  └─ returns a no-store JSON response
```

The production stack is Next.js 16, React 19, TypeScript, Tailwind CSS, OpenNext, and Cloudflare Workers. There are no runtime secrets or external APIs.

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run dev
```

## Verify

```bash
npm run check
npm run deploy:check
npm audit
```

The checks cover ESLint, TypeScript through the production build, campaign-engine tests, input-limit tests, the Next.js build, the OpenNext conversion, and a Wrangler deployment dry run.

## Deploy

Authenticate Wrangler to the target Cloudflare account, then run:

```bash
npm run deploy
```

The Worker name is `chatgpt-ads`, configured in `wrangler.jsonc`. The production address is `chatgpt-ads.recruiting-gains.workers.dev`.

## Project structure

```text
app/                       Next.js page, metadata, and API routes
components/                Landing-page sections, form, and result UI
lib/auditor.ts             Deterministic calculations and guardrails
lib/input-validation.ts    Request, platform, row, column, and size limits
public/                    Icon, manifest, and asset cache rules
test/                      Campaign-engine and request-validation tests
open-next.config.ts        OpenNext adapter configuration
wrangler.jsonc             Cloudflare Worker and static-asset configuration
```
