import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const directory = new URL("../public/media/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", directory), "utf8"),
);
for (const asset of manifest.files) {
  const response = await fetch(asset.url);
  if (!response.ok)
    throw new Error(`Media download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== asset.bytes || hash !== asset.sha256)
    throw new Error(`Media integrity check failed: ${asset.file}`);
  await writeFile(new URL(asset.file, directory), bytes);
  console.log(`Verified ${asset.file} (${bytes.length} bytes)`);
}
