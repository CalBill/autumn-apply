import { access, readFile } from "node:fs/promises";

const root = new URL("../apps/extension/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));

if (manifest.manifest_version !== 3) throw new Error("Extension must use Manifest V3");
const allowedHosts = new Set([
  "https://careers.tencent.com/*",
  "https://zhaopin.meituan.com/*",
  "https://app.mokahr.com/*",
  "https://jobs.bytedance.com/*",
  "https://*.jobs.feishu.cn/*",
  "https://boards-api.greenhouse.io/*",
  "https://api.lever.co/*",
  "https://api.eu.lever.co/*",
  "https://api.ashbyhq.com/*",
  "https://weixin.sogou.com/*",
  "http://127.0.0.1:43127/*",
]);
for (const host of manifest.host_permissions ?? []) {
  if (!allowedHosts.has(host)) throw new Error(`Unexpected extension host permission: ${host}`);
}

const allowedPermissions = new Set(["activeTab", "downloads", "scripting", "storage"]);
for (const permission of manifest.permissions ?? []) {
  if (!allowedPermissions.has(permission)) throw new Error(`Unexpected extension permission: ${permission}`);
}

for (const path of [
  "options.html", "options.js", "options.css", "popup.html", "popup.js", "popup.css",
  "discover.html", "discover.js", "discover.css",
  "prepare.html", "prepare.js", "prepare.css",
  "dashboard.html", "dashboard.js", "dashboard.css",
  "shared/profile.js", "shared/storage.js", "shared/matcher.js", "shared/resume.js", "shared/page-actions.js",
  "shared/form-mapping.js", "shared/applications.js",
  "shared/application-workflow.js",
  "shared/local-api.js",
  "shared/discovery.js", "shared/providers/tencent.js", "shared/providers/company-careers.js", "shared/providers/wechat.js", "shared/providers/sources.js",
]) {
  await access(new URL(path, root));
}

console.log("Extension manifest and permission check passed.");
