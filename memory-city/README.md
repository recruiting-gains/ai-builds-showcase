# Memory City

Memory City turns a note, lesson, or question into a living 3D city of connected ideas.

**Live app:** <https://memory-city.recruiting-gains.workers.dev/>

Every part of the city has a plain meaning:

- A **building** is one idea.
- A **district** is a group of ideas of the same kind.
- A **road** explains how two ideas connect.
- A **construction site** is an open question.
- Building height shows how much supporting material is attached. It is not an intelligence or mastery score.

## What someone can do

1. Explore a complete demo city without creating an account.
2. Paste one thought, note, or question.
3. Watch the main ideas rise as new buildings.
4. Select a building to read its meaning and trace it to the original note.
5. Focus on one district or switch to the full text list.
6. Export the complete private city as JSON.
7. Permanently delete the city and its semantic-search records.

The 3D city supports mouse, trackpad, and touch navigation. Motion can be paused, reduced-motion preferences are respected, rendering pauses offscreen, and the complete city is mirrored in a keyboard-accessible list.

## How the full stack works

In plain English:

1. The browser creates a private city and keeps its random edit key in local browser storage.
2. The Cloudflare Worker stores only a one-way hash of that key.
3. When a note is added, the Worker checks its size and treats it as untrusted text.
4. Workers AI returns a small structured plan: ideas, districts, descriptions, and relationships.
5. The Worker rejects any model output that does not match the strict allowlist.
6. D1 saves the original note, validated ideas, and roads as the source of truth.
7. A Workers AI embedding model converts each idea into numbers representing meaning.
8. Vectorize compares those numbers only inside the same private city and suggests connections to earlier ideas.
9. Every suggested match is checked against D1 before it becomes a road.
10. The browser receives plain data and creates all geometry locally with Three.js. The AI never controls HTML, JavaScript, database queries, URLs, colors, or 3D coordinates.

The request path is:

`Browser → Cloudflare Worker → Workers AI → strict validation → D1 + Vectorize → procedural 3D city`

## Infrastructure

- **Cloudflare Workers** serves the site and same-origin API.
- **Workers Static Assets** serves the compiled HTML, CSS, JavaScript, icon, manifest, and security headers.
- **Workers AI** organizes each note and creates embeddings.
- **D1** stores cities, original notes, buildings, and roads.
- **Vectorize** finds semantically related ideas in one city namespace.
- **Worker Rate Limiting** bounds public city creation and AI use.
- **Cloudflare Observability** records structured operational events without note text or private keys.

The production resources are named:

- Worker: `memory-city`
- D1 database: `memory-city-db`
- Vectorize index: `memory-city-concepts`
- Workers.dev URL: `memory-city.recruiting-gains.workers.dev`

## Project structure

```text
index.html                    Landing page and application shell
public/                       Icon, manifest, static security headers, notices
migrations/                   D1 schema
src/
  client/
    city.ts                   Procedural Three.js world and controls
    main.ts                   Browser state, API calls, list view, export/delete
    styles.css                Responsive cinematic interface
  shared/                     API types, limits, and runtime validation
  worker/
    index.ts                  API, auth, D1, Workers AI, Vectorize, assets
    prompt.ts                 Closed AI schema and fixed instructions
test/                         Validation and model-boundary tests
wrangler.jsonc                Cloudflare bindings, assets, limits, and logs
```

## Private city model

There are no accounts in this showcase.

When the browser starts a city, the Worker creates a 256-bit random edit key. The raw key is returned once and stored in that browser's local storage. D1 keeps only its SHA-256 hash. Every private read, write, export source, and delete action requires the raw key as a bearer credential.

This means:

- Someone cannot open a city with its ID alone.
- Clearing browser storage removes the key from that browser.
- There is no recovery email or password reset.
- Exporting before clearing browser data is the safe way to keep a personal copy.
- Sharing the private key gives another person full control, so it should not be shared.
- A private city expires 180 days after its last saved note. An hourly cleanup removes its D1 records and submits its Vectorize records for deletion.

All state-changing API requests are same-origin only. Private responses are not cached. The site uses a restrictive Content Security Policy and does not load third-party scripts.

## Data and AI limits

- One note: 40–5,000 characters
- One city: up to 16 notes and 96 buildings
- One note: 3–7 buildings and up to 10 model-proposed connections
- Request body: at most 24 KB
- Public rate limit: 8 city or AI actions per minute per key

Workers AI can misunderstand a note, choose a surprising district, or miss a relationship. The original text remains attached so the result can be checked. Model-created text is always rendered with text nodes, never as HTML.

Do not submit passwords, financial account details, medical records, confidential client data, or other highly sensitive information.

## Local development

Requirements:

- Node.js 20 or later
- npm
- A Cloudflare account authenticated with Wrangler
- The D1 and Vectorize resources configured in `wrangler.jsonc`

Install and generate Cloudflare binding types:

```bash
npm install
npm run cf-typegen
```

Apply the D1 migration locally and start the app:

```bash
npx wrangler d1 migrations apply memory-city-db --local
npm run dev
```

The AI and Vectorize bindings use remote Cloudflare resources during local development and may count toward account usage.

Run every code, test, build, and deployment check:

```bash
npm run check
```

## Deployment

On a new Cloudflare account, create the resources once:

```bash
npx wrangler d1 create memory-city-db
npx wrangler vectorize create memory-city-concepts --preset @cf/baai/bge-base-en-v1.5
```

Put the returned D1 ID in `wrangler.jsonc`, then run:

```bash
npx wrangler d1 migrations apply memory-city-db --remote
npm run deploy
```

The browser never receives a Cloudflare API token or model-provider key. It calls the same-origin Worker, which uses native Cloudflare bindings.

## Original implementation and third-party dependency

Memory City's product design, interface, visual language, prompts, data model, backend, and procedural city implementation are original to this repository.

Three.js is used as the low-level WebGL rendering library under its MIT License. Its required notice is in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). No third-party product branding or interface is used.

## License

The original Memory City code is covered by the repository's [MIT License](../LICENSE). Third-party code keeps its own license and notice.
