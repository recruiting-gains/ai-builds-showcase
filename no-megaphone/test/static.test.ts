import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "src/client/styles.css"), "utf8");
const client = readFileSync(path.join(root, "src/client/main.ts"), "utf8");
const worker = readFileSync(path.join(root, "src/worker/index.ts"), "utf8");
const readme = readFileSync(path.join(root, "README.md"), "utf8");

describe("static product boundaries", () => {
  it("uses no remote runtime assets or absolute network URLs", () => {
    for (const source of [html, css, client]) {
      expect(source).not.toMatch(/(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//iu);
    }
  });

  it("collects no free text, URL, username, or personal identity field", () => {
    expect(html).not.toContain("<textarea");
    expect(html).not.toMatch(/<input[^>]+type=["'](?:text|email|url|tel|search|password)["']/iu);
    expect(html).not.toMatch(
      /name=["'](?:username|name|email|url|website|discussion|message)["']/iu,
    );
  });

  it("keeps local context controls out of browser form submissions", () => {
    for (const id of ["business-type", "experience-level", "service-area"]) {
      const select = html.match(new RegExp(`<select[^>]*id=["']${id}["'][^>]*>`, "iu"));
      expect(select?.[0], `select #${id}`).toBeDefined();
      expect(select?.[0]).not.toMatch(/\sname\s*=/iu);
    }
    expect(html).toMatch(/<form[^>]*id=["']context-form["'][^>]*\shidden(?:\s|>)/iu);
  });

  it("keeps every same-page link connected to a real target", () => {
    const targets = new Set([...html.matchAll(/\sid=["']([^"']+)["']/gu)].map((match) => match[1]));
    const anchors = [...html.matchAll(/\shref=["']#([^"']+)["']/gu)].map((match) => match[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(targets.has(anchor)).toBe(true);
  });

  it("references only source or public assets that exist", () => {
    const localAssets = [
      "public/favicon.svg",
      "public/og-card.svg",
      "public/site.webmanifest",
      "src/client/main.ts",
    ];
    for (const asset of localAssets) expect(existsSync(path.join(root, asset))).toBe(true);
  });

  it("keeps structural HTML tags balanced", () => {
    for (const tag of ["section", "form", "fieldset", "select", "details", "dialog", "table"]) {
      const openings = html.match(new RegExp(`<${tag}(?:\\s|>)`, "giu")) ?? [];
      const closings = html.match(new RegExp(`</${tag}>`, "giu")) ?? [];
      expect(closings, `${tag} closing tags`).toHaveLength(openings.length);
    }
  });

  it("keeps every local project README link connected to an existing file", () => {
    const links = [...readme.matchAll(/\]\((\.\.?\/[^)#]+)(?:#[^)]+)?\)/gu)]
      .map((match) => match[1])
      .filter((link): link is string => typeof link === "string");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(existsSync(path.resolve(root, link))).toBe(true);
  });

  it("contains no likely secret material in runtime source or configuration", () => {
    const runtimeSource = [
      html,
      css,
      client,
      worker,
      readFileSync(path.join(root, "wrangler.jsonc"), "utf8"),
    ].join("\n");
    expect(runtimeSource).not.toMatch(
      /(?:api[_-]?key|client[_-]?secret|private[_-]?key)\s*[:=]\s*["'][^"']+/iu,
    );
    expect(runtimeSource).not.toMatch(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u);
  });

  it("contains no unresolved merge markers", () => {
    for (const source of [html, css, client, worker]) {
      expect(source).not.toMatch(/^(?:<{7}|={7}|>{7})/mu);
    }
  });
});
