import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openSetup } from "./platform-launch.mjs";

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
    windowsHide: true,
  });
  child.unref();
  closeSync(log);
  writeFileSync(resolve(runtimeDir, "api.pid"), `${child.pid}\n`, { mode: 0o600 });
  status = await waitForHealth();
}

const setup = process.env.AUTUMN_APPLY_NO_OPEN !== "1" ? openSetup({ extensionDir }) : null;
console.log(`\n本机服务在线：v${status.version}`);
console.log(`扩展目录：${extensionDir}`);
if (process.env.AUTUMN_APPLY_NO_OPEN !== "1") {
  console.log(setup.browserOpened
    ? "Chrome 已打开扩展管理页。首次使用请选择“加载已解压的扩展程序”，然后选择上面的扩展目录。"
    : "未自动找到 Chrome。请手动打开 chrome://extensions，选择“加载已解压的扩展程序”，然后选择上面的扩展目录。");
}
