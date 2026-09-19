import { access, readFile } from "node:fs/promises";

const root = new URL("../apps/extension/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));

if (manifest.manifest_version !== 3) throw new Error("Extension must use Manifest V3");
if (manifest.host_permissions?.length) throw new Error("Initial extension must not request broad host permissions");

const allowedPermissions = new Set(["activeTab", "downloads", "scripting", "storage"]);
for (const permission of manifest.permissions ?? []) {
  if (!allowedPermissions.has(permission)) throw new Error(`Unexpected extension permission: ${permission}`);
}

for (const path of [
  "options.html", "options.js", "options.css", "popup.html", "popup.js", "popup.css",
  "shared/profile.js", "shared/storage.js", "shared/matcher.js", "shared/resume.js", "shared/page-actions.js",
  "shared/form-mapping.js", "shared/applications.js",
]) {
  await access(new URL(path, root));
}

console.log("Extension manifest and permission check passed.");
