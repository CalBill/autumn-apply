import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(target);
    return /\.(?:js|mjs)$/.test(entry.name) ? [target] : [];
  }));
  return files.flat();
}

const files = (await Promise.all([javascriptFiles("apps"), javascriptFiles("scripts")])).flat();
await Promise.all(files.map((file) => run(process.execPath, ["--check", file])));
console.log(`JavaScript syntax check passed (${files.length} files).`);
