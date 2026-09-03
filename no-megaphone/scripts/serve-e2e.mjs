import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import { build } from "vite";

const root = process.cwd();
const distributionDirectory = path.join(root, "dist");
const workerDirectory = path.join(root, ".tmp", "worker");

await build({
  configFile: false,
  logLevel: "silent",
  build: {
    ssr: path.join(root, "src", "worker", "index.ts"),
    outDir: workerDirectory,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "worker.mjs" } },
  },
});

const workerModule = await import(pathToFileURL(path.join(workerDirectory, "worker.mjs")).href);
const handleRequest = workerModule.handleRequest;
if (typeof handleRequest !== "function")
  throw new Error("Worker bundle has no handleRequest export.");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

async function serveAsset(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolvedPath = path.resolve(distributionDirectory, `.${pathname}`);
  const relative = path.relative(distributionDirectory, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    return new Response("Not found", { status: 404 });

  try {
    const details = await stat(resolvedPath);
    if (!details.isFile()) return new Response("Not found", { status: 404 });
    const headers = new Headers({
      "Content-Length": String(details.size),
      "Content-Type": contentTypes.get(path.extname(resolvedPath)) ?? "application/octet-stream",
    });
    if (request.method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(Readable.toWeb(createReadStream(resolvedPath)), { status: 200, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const requestUrl = new URL(incoming.url ?? "/", "http://127.0.0.1:8787");
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
    const request = new Request(requestUrl, {
      method: incoming.method,
      headers,
      body: hasBody ? Readable.toWeb(incoming) : undefined,
      ...(hasBody ? { duplex: "half" } : {}),
    });
    const response = await handleRequest(request, { ASSETS: { fetch: serveAsset } });
    outgoing.statusCode = response.status;
    outgoing.statusMessage = response.statusText;
    response.headers.forEach((value, key) => {
      outgoing.setHeader(key, value);
    });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("Content-Type", "text/plain; charset=utf-8");
    outgoing.end("Local test server error");
    console.error(error);
  }
});

server.listen(8787, "127.0.0.1", () => {
  console.log("NO MEGAPHONE test server listening on http://127.0.0.1:8787");
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
