import assert from "node:assert/strict";
import test from "node:test";
import { findWindowsChrome, openSetup, windowsChromeCandidates } from "./platform-launch.mjs";

test("Windows Chrome discovery checks machine and per-user installs", () => {
  const env = {
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
  };
  const candidates = windowsChromeCandidates(env);
  assert.equal(candidates.length, 3);
  assert.match(candidates[2], /AppData[\\/]Local[\\/]Google[\\/]Chrome/);
  assert.equal(findWindowsChrome(env, (candidate) => candidate === candidates[2]), candidates[2]);
});

test("Windows setup reveals the extension and opens the discovered Chrome", () => {
  const calls = [];
  const env = { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" };
  const [chrome] = windowsChromeCandidates(env);
  const result = openSetup({
    platform: "win32",
    extensionDir: "C:\\AutumnApply\\dist\\extension",
    env,
    fileExists: (candidate) => candidate === chrome,
    start: (command, args, options) => {
      calls.push({ command, args, options });
      return { unref() {} };
    },
  });
  assert.equal(result.browserOpened, true);
  assert.equal(calls[0].command, "explorer.exe");
  assert.equal(calls[1].command, chrome);
  assert.deepEqual(calls[1].args, ["chrome://extensions"]);
});

test("Windows setup remains usable when Chrome needs to be opened manually", () => {
  const calls = [];
  const result = openSetup({
    platform: "win32",
    extensionDir: "C:\\AutumnApply\\dist\\extension",
    env: {},
    fileExists: () => false,
    start: (command) => {
      calls.push(command);
      return { unref() {} };
    },
  });
  assert.equal(result.browserOpened, false);
  assert.deepEqual(calls, ["explorer.exe"]);
});
