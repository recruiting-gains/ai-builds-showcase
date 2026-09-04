import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function readProjectFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, new URL("../", import.meta.url)), "utf8");
}

describe("privacy-preserving infrastructure", () => {
  it("routes only API paths through the Worker and exposes no persistence binding", () => {
    const config = JSON.parse(readProjectFile("wrangler.jsonc")) as {
      assets?: {
        binding?: string;
        directory?: string;
        not_found_handling?: string;
        run_worker_first?: string[];
      };
      compatibility_date?: string;
      compatibility_flags?: string[];
      observability?: {
        enabled?: boolean;
        redact_query_string?: boolean;
      };
      [key: string]: unknown;
    };

    expect(config.compatibility_date).toBe("2026-09-03");
    expect(config.compatibility_flags).toContain("nodejs_compat");
    expect(config.assets).toEqual({
      binding: "ASSETS",
      directory: "./dist",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"],
    });
    expect(config.observability).toMatchObject({
      enabled: true,
      redact_query_string: true,
    });
    expect(config).not.toHaveProperty("ai");
    expect(config).not.toHaveProperty("d1_databases");
    expect(config).not.toHaveProperty("kv_namespaces");
    expect(config).not.toHaveProperty("r2_buckets");
  });

  it("does not contain a code path that reads request content", () => {
    const workerSource = readProjectFile("src/worker/index.ts");

    expect(workerSource).not.toMatch(
      /request\.(?:arrayBuffer|blob|bytes|formData|json|text)\s*\(/u,
    );
    expect(workerSource).not.toMatch(/url\.searchParams/u);
    expect(workerSource).not.toMatch(/console\.(?:debug|info|log|warn)\s*\(/u);
  });

  it("keeps generated and local-only files out of source control and asset uploads", () => {
    const gitignore = readProjectFile(".gitignore");
    const assetsIgnore = readProjectFile(".assetsignore");

    expect(projectRoot).toContain("mask-before-you-ask");
    expect(gitignore).toContain(".dev.vars");
    expect(gitignore).toContain("node_modules");
    expect(gitignore).toContain("dist");
    expect(assetsIgnore).toContain("_worker.js");
    expect(assetsIgnore).toContain("_routes.json");

    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.build).toContain("scripts/prepare-assets.mjs");
  });
});
