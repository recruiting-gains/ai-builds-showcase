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
if (typeof handleRequest !== "function") {
  throw new Error("Worker bundle has no handleRequest export.");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
]);

function safeAssetPath(pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.resolve(distributionDirectory, `.${requestedPath}`);
  const relativePath = path.relative(distributionDirectory, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return resolvedPath;
}

async function assetFileResponse(request, resolvedPath) {
  try {
    const details = await stat(resolvedPath);
    if (!details.isFile()) return null;

    const headers = new Headers({
      "Content-Length": String(details.size),
      "Content-Type": contentTypes.get(path.extname(resolvedPath)) ?? "application/octet-stream",
    });
    if (request.method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(Readable.toWeb(createReadStream(resolvedPath)), { status: 200, headers });
  } catch {
    return null;
  }
}

async function serveAsset(request) {
  const url = new URL(request.url);
  const decodedPath = decodeURIComponent(url.pathname);
  const resolvedPath = safeAssetPath(decodedPath);
  if (!resolvedPath) return new Response("Not found", { status: 404 });

  const directResponse = await assetFileResponse(request, resolvedPath);
  if (directResponse) return directResponse;

  const acceptsHtml = request.headers.get("Accept")?.includes("text/html") ?? false;
  if ((request.method === "GET" || request.method === "HEAD") && acceptsHtml) {
    const spaResponse = await assetFileResponse(
      request,
      path.join(distributionDirectory, "index.html"),
    );
    if (spaResponse) return spaResponse;
  }

  return new Response("Not found", { status: 404 });
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

    if (!response.body) {
      outgoing.end();
      return;
    }

    Readable.fromWeb(response.body).pipe(outgoing);
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("Content-Type", "text/plain; charset=utf-8");
    outgoing.end("Local test server error");
    console.error(error);
  }
});

server.listen(8787, "127.0.0.1", () => {
  console.log("Mask Before You Ask test server listening on http://127.0.0.1:8787");
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
