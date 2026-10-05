import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ESLint } from "eslint";
import { nextFixtures } from "./oxlint-fixtures.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const oxlint = join(dirname(require.resolve("oxlint/package.json")), "bin/oxlint");
const eslint = new ESLint({ cwd: root });
const json = async (name) =>
  JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"));
const expected = await json("expected-rules.json");
const activeRules = (rules) =>
  Object.fromEntries(Object.entries(rules).filter(([, value]) => value[0] !== 0));

function runOxlint(args) {
  const result = spawnSync(process.execPath, [oxlint, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  assert.ok(result.stdout.trim(), "Oxlint must return output; an empty run is not a pass");
  return JSON.parse(result.stdout);
}

function summarize({ ruleId, severity, message, messageId, line, column, endLine, endColumn }) {
  return {
    ruleId: ruleId?.replace("next-compat/", "@next/next/"),
    severity,
    message: message.replaceAll(root, "<root>/"),
    ...(messageId ? { messageId } : {}),
    line,
    column,
    ...(endLine ? { endLine, endColumn } : {}),
  };
}

test("effective ESLint rules, options and globals match the pre-migration config", async () => {
  const profiles = {
    typescript: ["app/page.tsx", "lib/example.ts", "lib/example.mts", "lib/example.cts"],
    javascript: ["scripts/example.js", "scripts/example.jsx", "scripts/example.mjs"],
    commonjs: ["scripts/example.cjs"],
  };
  for (const [profile, filenames] of Object.entries(profiles)) {
    for (const filename of filenames) {
      const config = await eslint.calculateConfigForFile(filename);
      const rules = activeRules(config.rules);
      const locationRule = "next-compat/no-location-assign-relative-destination";
      if (profile !== "commonjs") assert.deepEqual(rules[locationRule], [1]);
      delete rules[locationRule];
      assert.deepEqual(rules, expected.profiles[profile].rules, filename);
      const globalsHash = createHash("sha256")
        .update(JSON.stringify(Object.entries(config.languageOptions.globals ?? {}).sort()))
        .digest("hex");
      assert.equal(globalsHash, expected.profiles[profile].globalsHash, filename);
      assert.equal(config.languageOptions.parser.meta.name, "typescript-eslint/parser");
    }
  }
});

test("all 22 original Next checks remain enabled at their original severities", () => {
  const config = runOxlint(["--print-config"]);
  const levels = { allow: 0, warn: 1, deny: 2 };
  const mapped = Object.fromEntries(
    Object.entries(config.rules).map(([rule, value]) => [
      rule.replace("nextjs/", "@next/next/"),
      [levels[value]],
    ]),
  );
  assert.equal(Object.keys(mapped).length, 21);
  mapped["@next/next/no-location-assign-relative-destination"] = [1];
  assert.deepEqual(mapped, expected.nextRules);
  assert.deepEqual(config.plugins, ["nextjs"]);
  assert.equal(config.categories.correctness, "allow");
});

test("generated outputs are ignored consistently by both linters", async () => {
  const config = runOxlint(["--print-config"]);
  const ignored = [".next/**", "out/**", "build/**", ".open-next/**", ".wrangler/**", "cloudflare-env.d.ts", "next-env.d.ts"];
  assert.deepEqual(config.ignorePatterns, ignored);
  for (const pattern of ignored) {
    assert.equal(await eslint.isPathIgnored(pattern.replace("**", "example.js")), true, pattern);
  }
});

for (const [file, prefix] of [
  ["location-fixtures.json", "standalone Next navigation parity"],
  ["eslint-fixtures.json", "React, compiler, accessibility and TypeScript parity"],
]) {
  const { cases } = await json(file);
  for (const fixture of cases) {
    test(`${prefix}: ${fixture.name}`, async () => {
      const [result] = await eslint.lintText(fixture.code, { filePath: "app/lint-fixture.tsx" });
      assert.equal(result.fatalErrorCount, 0);
      const messages = result.messages.filter((message) =>
        file === "location-fixtures.json"
          ? message.ruleId?.startsWith("next-compat/")
          : message.ruleId && !message.ruleId.startsWith("next-compat/"),
      );
      assert.deepEqual(messages.map(summarize), fixture.messages);
    });
  }
}

test("Oxlint detects invalid and accepts valid examples for all 21 Next checks", async (t) => {
  assert.deepEqual(
    nextFixtures.map(({ rule }) => `@next/next/${rule}`).sort(),
    Object.keys(expected.nextRules).filter((rule) => !rule.endsWith("/no-location-assign-relative-destination")).sort(),
  );
  const directory = await mkdtemp(join(tmpdir(), "chatgpt-ads-lint-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = [];
  for (const fixture of nextFixtures) {
    for (const kind of ["invalid", "valid"]) {
      const filename = join(directory, fixture.rule, kind, fixture.filename ?? "pages/example.tsx");
      await mkdir(dirname(filename), { recursive: true });
      await writeFile(filename, fixture[kind]);
      files.push({ filename, kind, rule: fixture.rule });
    }
  }
  const report = runOxlint(["--config", join(root, ".oxlintrc.json"), "--format", "json", directory]);
  assert.equal(report.number_of_files, files.length);
  for (const { filename, kind, rule } of files) {
    const matches = report.diagnostics.filter((diagnostic) =>
      diagnostic.filename === filename && diagnostic.code === `next(${rule})`,
    );
    assert.equal(matches.length > 0, kind === "invalid", `${rule}: ${kind}`);
    for (const match of matches) {
      const level = expected.nextRules[`@next/next/${rule}`][0];
      assert.equal(match.severity, level === 2 ? "error" : "warning");
    }
  }
});

test("Oxlint also rejects unlisted internal links while accepting external, fragment and download links", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chatgpt-ads-anchor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, "anchors.tsx");
  await writeFile(filename, [
    '<a href="/lint-fixture-route-that-does-not-exist">Internal</a>;',
    '<a href="https://example.com">External</a>;',
    '<a href="#heading">Fragment</a>;',
    '<a href="/report.csv" download>Download</a>;',
  ].join("\n"));
  const report = runOxlint(["--config", join(root, ".oxlintrc.json"), "--format", "json", filename]);
  const matches = report.diagnostics.filter((diagnostic) => diagnostic.code === "next(no-html-link-for-pages)");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].labels[0].span.line, 1);
});
