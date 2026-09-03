# Explain It Visually

Turn an explanation, process, timeline, comparison, or set of notes into an editable infographic.

Paste your text, choose **Auto**, **Steps**, **Timeline**, **Comparison**, or **List**, then review the AI draft and download it as a PNG or SVG.

**Live app:** <https://explain-it-visually.recruiting-gains.workers.dev/>

## What it does

Explain It Visually helps people organize written information into a visual format:

1. Paste text.
2. Choose a format, or let Auto choose.
3. Review and edit the generated draft.
4. Download the result.

AI creates the first draft. The user reviews the wording, facts, and final design.

## Features

- Five format choices: Auto, Steps, Timeline, Comparison, and List
- Bright, Dark, and Sketch visual styles
- Editable titles, explanations, labels, items, takeaways, and accessible descriptions
- A structured text version beside every visual
- PNG and SVG downloads created in the browser
- No account, database, or saved project history
- Responsive, keyboard-friendly interface with reduced-motion support
- A Cloudflare Worker API using Workers AI JSON Mode

## How it works

In plain English:

- The browser displays the landing page and visual editor.
- **Make it visual** sends the text and selected options to the Cloudflare Worker.
- The Worker checks the request, applies a public rate limit, and asks Workers AI for a structured draft.
- The Worker treats the model result as untrusted and validates every returned field.
- The browser maps that safe data to an allowlisted AntV Infographic template.
- Editing and PNG/SVG creation happen in the browser.

The request flow is:

`Browser → Cloudflare Worker → Workers AI → validated draft → browser editor → download`

No model-generated HTML, SVG, JavaScript, template name, or URL is accepted. The application has no KV, D1, R2, user account, or project-history storage.

## Project structure

```text
index.html                 Landing page and application shell
public/                    Static metadata, headers, and license notice
src/
  client/                  Browser editor, rendering, downloads, and styles
  shared/                  Request/response types and runtime validation
  worker/                  API routes, AI call, security, and static assets
test/                      Validation and fixed-prompt tests
wrangler.jsonc             Worker, static assets, AI, rate limit, and logs
```

## Local development

Requirements:

- Node.js 20 or later
- npm
- A Cloudflare account for Workers AI requests and deployment

```bash
npm install
npm run cf-typegen
npm run dev
```

Open the local address Wrangler prints, normally <http://localhost:8787>. Local AI requests use the remote Workers AI binding and may count toward Cloudflare usage.

Run every project check:

```bash
npm run check
```

## Cloudflare deployment

Authenticate once on a new machine:

```bash
npx wrangler login
```

Deploy the static site, Worker API, rate limiter, and Workers AI binding:

```bash
npm run deploy
```

The browser never receives a provider API key. It calls the same-origin Worker, and the Worker uses the native `AI` binding.

## Privacy limits

Explain It Visually does not create accounts or intentionally save a history of submitted text or generated visuals. The application code does not write them to a database, object store, analytics tool, session replay, or application log.

Submitted text does leave the browser: the Cloudflare Worker sends it to Cloudflare Workers AI to produce the draft. Normal Cloudflare security, abuse-prevention, and infrastructure handling may still apply under Cloudflare's policies. A result remains in the current browser tab until it is replaced, cleared, or the page is closed; downloaded files go wherever the browser saves them.

Do not submit passwords, financial account details, medical records, private client information, or other highly sensitive material.

## AI limits

The output is a draft, not a verified source. AI can misunderstand text, omit context, change meaning while rewording, put items in the wrong order, or choose an unsuitable format.

Check names, dates, numbers, facts, ordering, and meaning before downloading or sharing. The app organizes information; it does not verify whether the information is correct.

## Original implementation and open-source credit

The product concept was informed by studying open-source text-to-infographic workflows. This application has original branding, landing page, interface, prompt design, validation, browser editing flow, and Cloudflare backend.

Visual rendering uses [`@antv/infographic`](https://github.com/antvis/Infographic), copyright (c) 2025 AntV, under the MIT License. The project is independent and is not affiliated with or endorsed by AntV. The complete required notice is in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

The original Explain It Visually code is covered by the repository's [MIT License](../LICENSE). Third-party code keeps its own license and notice.
