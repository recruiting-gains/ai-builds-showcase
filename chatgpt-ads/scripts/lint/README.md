# Lint coverage after removing eslint-config-next

`npm run lint` runs ESLint and Oxlint. `npm run test:lint` checks the migration
contract without installing the previous Next ESLint package. Node's test runner
uses `*.checks.mjs`, so these checks are separate from Vitest's application tests.

The previous configuration combined `eslint-config-next/core-web-vitals` and
`eslint-config-next/typescript` 16.3.8. Its enabled rules and options were captured
in `expected-rules.json` before replacement:

| Coverage | TypeScript | JavaScript | CommonJS |
| --- | ---: | ---: | ---: |
| React | 17 | 17 | 0 |
| Hooks and React Compiler | 16 | 16 | 0 |
| Accessibility | 6 | 6 | 0 |
| Import | 1 | 1 | 0 |
| TypeScript | 20 | 20 | 20 |
| Core ESLint | 4 | 0 | 0 |

ESLint uses the same plugin versions and the same TypeScript parser as the prior
effective configuration. The globals package is 16.4.0, which was the version
resolved by `eslint-config-next` (the old root lock also contained globals 14).
The tests compare effective rule options, severities and globals for `.ts`,
`.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs` files. The sole enabled
import rule, `import/no-anonymous-default-export`, does not resolve modules, so
the unused import-resolver settings and packages are not carried over.

Oxlint 1.86.0 supplies 21 of the 22 previous Next checks. `.oxlintrc.json` enables
them explicitly at the original Core Web Vitals severities. Its unrelated
default correctness rules are disabled because ESLint remains responsible for
the existing general JavaScript, TypeScript, React and compiler checks. The
previous generated-file exclusions are retained in both linters.

## The remaining Next rule

`no-location-assign-relative-destination.mjs` preserves the rule missing from
Oxlint 1.86.0. It is a JavaScript adaptation of the
[Next 16.3.8 source](https://github.com/vercel/next.js/blob/v16.3.8/packages/eslint-plugin-next/src/rules/no-location-assign-relative-destination.ts),
with TypeScript annotations and the identity `defineRule` wrapper removed. It
is registered locally as
`next-compat/no-location-assign-relative-destination`, at the original warning
severity. The module does not import the Next plugin or any glob library.
`NEXT-LICENSE.txt` retains the upstream MIT license and copyright notice.

The original rule resolved `@eslint-community/eslint-utils` 4.9.1; this project
uses the already present 4.10.1 helper release. `location-fixtures.json` records
32 original-rule outcomes, including complete diagnostic text and source
positions. They cover relative and external URLs, computed members, variable
reassignments, string templates, concatenation, unknown values and shadowed
browser globals. The new rule must reproduce those outcomes.

## Behavioral regression checks

- `eslint-fixtures.json` records 16 positive/negative outcomes from the original
  configuration, covering React, Hooks, React Compiler, accessibility, imports,
  TypeScript and core rules. Only the checkout's absolute path in a compiler
  diagnostic is normalized to `<root>/`.
- `oxlint-fixtures.mjs` contains a positive and negative example for every one of
  the 21 mapped Next rules. All 42 cases were also checked against the original
  Next 16.3.8 rule. The suite verifies actual diagnostics and severity, not just
  a successful process exit.
- Oxlint's internal-anchor check is deliberately broader: it rejects a literal
  internal `<a href="/path">` even when `/path` is absent from the current route
  tree. The previous Next rule only rejected links matching discovered routes.
  A regression case records this stronger behavior, and verifies that external,
  fragment and download links remain accepted. Use Next's `Link` for internal
  navigation. See the [Oxlint rule documentation](https://oxc.rs/docs/guide/usage/linter/rules/nextjs/no-html-link-for-pages.html).

These fixtures establish the preserved checks and representative behavior; they
are not a claim that two independent linter implementations have identical
behavior for every possible program. When updating lint dependencies, review
the effective-rule snapshot and fixture changes against upstream behavior. Once
Oxlint supports the remaining navigation rule, compare the same fixtures before
removing the local adaptation.
