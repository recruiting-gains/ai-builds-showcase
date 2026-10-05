# Static build compatibility

Agent Office uses Next.js 16.3.8 with `output: 'export'`. The application remains
a static demo plus a separate authenticated loopback bridge for the Mac
companion. This replaces Vinext's build dependency on the unpatched `braces`
package; it does not replace the page, bridge protocol, or native app.

`npm run build` exports into `out/`, then packages those assets in `dist/client`.
That directory remains the input for the native app builder, bridge server, and
root Wrangler configuration. `npm start` previews these static assets locally
through Wrangler. The package step validates the Sites manifest, rejects links
and private runtime files in the exported tree, and removes stale public assets.

The source `.openai/hosting.json` is preserved byte for byte in
`dist/.openai/hosting.json`, with optional `drizzle/` build metadata kept beside
it. Metadata is outside the public asset directory. The existing manifest uses
`static.directory: "dist/client"` and no storage bindings, matching the Sites
static-export contract. No Site identity, audience, or deployment is changed.

The former Vite Sites plugin also supplied local mock ChatGPT sign-in endpoints
and authentication-header sanitization to its development server. Those unused
mock endpoints are absent from the Next development server. Agent Office has no
ChatGPT sign-in integration; its real local authentication remains exclusively
in the unchanged loopback bridge. A future authenticated Sites feature needs a
separately configured, supported server integration. This migration does not
verify a new hosted Sites publication or editor session.

The old export linked Google's Geist and Geist Mono stylesheets remotely. It did
not package font files. The same links, CSS variables, and fallback font stacks
are retained explicitly, so builds do not fetch Google fonts. The companion's
unchanged Content Security Policy continues blocking remote fonts; hosted pages
can use them when permitted. Do not replace this with `next/font/google` without
reviewing the resulting font and offline behavior change.

The `shadcn` CLI was unused, but its `tailwind.css` export was imported. Its exact
4.18.0 stylesheet and MIT license now live in `app/vendor/shadcn/`, with provenance
and SHA-256 recorded there. The independent `@shadcn/react` component dependency
remains. This removes the CLI's vulnerable glob dependencies while preserving
the styles; it is not an audit exclusion or a renamed dependency.

Verification commands:

```sh
npm ci --ignore-scripts
npm audit --audit-level=moderate
npm run check
npm run build
npm run check:build
npm run check:deploy
```

`npm run check` generates route types, checks TypeScript, and runs the existing
bridge/state/widget tests plus packaging regressions. `check:build` serves the
actual export through a temporary loopback bridge, verifies asset responses and
unchanged authentication/origin guards, and checks that Sites metadata is not
public. `check:deploy` is a local Wrangler dry-run; it does not publish anything.
The native executable still requires a Mac to compile and exercise.
