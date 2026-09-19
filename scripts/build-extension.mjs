import { cp, mkdir, rm } from "node:fs/promises";

const source = new URL("../apps/extension/", import.meta.url);
const destination = new URL("../dist/extension/", import.meta.url);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter(path) {
    return !path.endsWith("package.json") && !path.endsWith("README.md") && !path.endsWith(".test.js");
  },
});

console.log("Built Chrome extension in dist/extension");
