# Verification record

Release checked on September 3, 2026.

## Automated release gate

The complete `npm run check` gate passed from a clean dependency install:

- Biome formatting: passed
- Biome linting: passed
- Client, Worker, unit-test, and browser-test TypeScript checks: passed
- Vitest: 110 tests passed
- Playwright: 4 browser journeys passed
- Automated Axe scan: zero reported violations
- Browser privacy assertion: the test email, phone number, and custom name appeared in no network request or browser storage
- Responsive check: no horizontal overflow at a 390-pixel mobile viewport
- Vite production build: passed
- Wrangler deployment dry run: passed

Coverage gate:

| Area | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Whole tested codebase | 90.57% | 83.06% | 100% | 95.73% |
| Cloudflare Worker | 100% | 91.17% | 100% | 100% |

## Infrastructure validation

- Wrangler: 4.129.0
- Compatibility date: `2026-09-03`
- Compatibility flag: `nodejs_compat`
- Static assets: direct Cloudflare delivery from `dist`
- Worker-first routes: `/api/*` only
- Bindings: static `ASSETS` binding only
- Persistence: no D1, KV, R2, Durable Object, database, or application storage binding
- External services: no AI binding, secret, analytics script, or third-party API

`wrangler types` successfully generated types from the production configuration. The generated runtime declaration is reproducible and intentionally excluded from source control because the project uses the date-matched `@cloudflare/workers-types` package for checked-in type support.

## Production verification

Deployment:

- URL: <https://mask-before-you-ask.recruiting-gains.workers.dev/>
- Cloudflare version: `3b3aae8c-c23f-49e8-9701-ce46cf787783`
- Root document: HTTP 200
- Health endpoint: HTTP 200 with `processing: browser-only` and `persistence: none`
- Policy endpoint: HTTP 200 with `serverReceivesText: false`, `storesText: false`, and `humanReviewRequired: true`
- Attempted `POST` with a private marker: HTTP 405; marker not reflected
- Attempted query-string submission: HTTP 400
- Root security headers: restrictive CSP, HSTS, no-referrer, `nosniff`, anti-framing, same-origin opener/resource policies, and restricted browser permissions

A real-browser smoke test against the public URL entered a fictional name, email address, and phone number; found all three; produced `[NAME 1]`, `[EMAIL 1]`, and `[PHONE 1]`; and confirmed that the source values appeared in no outgoing request. The final public interface was also inspected visually at desktop and mobile sizes.

## Scope of the evidence

Automated checks can confirm the implemented boundary and catch common regressions, but they cannot guarantee anonymity, detect every kind of sensitive information, or replace testing with people who use assistive technology. The product keeps that limitation visible in its interface.
