import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = resolve(root, ".autumn-apply-runtime");
const extensionDir = resolve(root, "dist/extension");
const healthUrl = "http://127.0.0.1:43127/health";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function health() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_500) });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await health();
    if (status?.ok) return status;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`本机服务没有在 ${healthUrl} 启动；请查看 ${resolve(runtimeDir, "api.log")}`);
}

function openForSetup() {
  if (process.platform === "darwin") {
    spawn("open", [extensionDir], { detached: true, stdio: "ignore" }).unref();
    spawn("open", ["-a", "Google Chrome", "chrome://extensions"], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "win32") {
    spawn("explorer", [extensionDir], { detached: true, stdio: "ignore" }).unref();
    spawn("cmd", ["/c", "start", "", "chrome://extensions"], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [extensionDir], { detached: true, stdio: "ignore" }).unref();
    spawn("google-chrome", ["chrome://extensions"], { detached: true, stdio: "ignore" }).unref();
  }
}

console.log("AutumnApply：正在构建浏览器扩展…");
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

let status = await health();
if (!status?.ok) {
  const logPath = resolve(runtimeDir, "api.log");
  const log = openSync(logPath, "a", 0o600);
  const child = spawn(process.execPath, [resolve(root, "apps/api/src/server.js")], {
    cwd: root,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  closeSync(log);
  writeFileSync(resolve(runtimeDir, "api.pid"), `${child.pid}\n`, { mode: 0o600 });
  status = await waitForHealth();
}

if (process.env.AUTUMN_APPLY_NO_OPEN !== "1") openForSetup();
console.log(`\n本机服务在线：v${status.version}`);
console.log(`扩展目录：${extensionDir}`);
if (process.env.AUTUMN_APPLY_NO_OPEN !== "1") {
  console.log("Chrome 已打开扩展管理页。首次使用请选择“加载已解压的扩展程序”，然后选择上面的扩展目录。");
}
