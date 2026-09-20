import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

export function windowsChromeCandidates(env = process.env) {
  return [
    env.PROGRAMFILES,
    env["PROGRAMFILES(X86)"],
    env.LOCALAPPDATA,
  ].filter(Boolean).map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe"));
}

export function findWindowsChrome(env = process.env, fileExists = existsSync) {
  return windowsChromeCandidates(env).find((candidate) => fileExists(candidate)) ?? "";
}

export function openSetup({
  platform = process.platform,
  extensionDir,
  env = process.env,
  fileExists = existsSync,
  start = spawn,
} = {}) {
  const started = [];
  const open = (command, args) => {
    const child = start(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref?.();
    started.push({ command, args });
  };

  if (platform === "darwin") {
    open("open", [extensionDir]);
    open("open", ["-a", "Google Chrome", "chrome://extensions"]);
    return { browserOpened: true, started };
  }
  if (platform === "win32") {
    open("explorer.exe", [extensionDir]);
    const chrome = findWindowsChrome(env, fileExists);
    if (chrome) open(chrome, ["chrome://extensions"]);
    return { browserOpened: Boolean(chrome), started };
  }
  open("xdg-open", [extensionDir]);
  open("google-chrome", ["chrome://extensions"]);
  return { browserOpened: true, started };
}
