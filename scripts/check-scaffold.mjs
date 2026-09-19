import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/architecture.md",
  "docs/roadmap.md",
  "packages/contracts/src/index.ts",
];

await Promise.all(requiredFiles.map((path) => access(path)));

const gitignore = await readFile(".gitignore", "utf8");
for (const sensitivePath of [".env", "data/", "private/", "userdata/"]) {
  if (!gitignore.includes(sensitivePath)) {
    throw new Error(`Missing sensitive path in .gitignore: ${sensitivePath}`);
  }
}

const license = await readFile("LICENSE", "utf8");
if (!license.startsWith("MIT License")) {
  throw new Error("Repository license is not MIT");
}

console.log(`Scaffold check passed (${requiredFiles.length} required files).`);
