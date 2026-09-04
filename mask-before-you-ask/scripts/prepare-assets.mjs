import { copyFile } from "node:fs/promises";

const source = new URL("../.assetsignore", import.meta.url);
const destination = new URL("../dist/.assetsignore", import.meta.url);

await copyFile(source, destination);
