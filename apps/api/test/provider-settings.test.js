import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createKeyStore, createProviderSettingsStore, createWindowsDpapi, normalizeProviderConfig } from "../src/provider-settings.js";

test("provider configuration only accepts official endpoints", () => {
  assert.deepEqual(normalizeProviderConfig({ provider: "deepseek" }), {
    provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash",
  });
  assert.throws(() => normalizeProviderConfig({ provider: "openai", baseUrl: "https://proxy.example" }), /官方 API/);
});

test("macOS key store never returns secrets in status", async () => {
  const calls = [];
  const keyStore = createKeyStore({
    platform: "darwin",
    env: {},
    run: async (command, args) => {
      calls.push([command, args]);
      return { stdout: args[0] === "find-generic-password" ? "sk-test-secret\n" : "" };
    },
  });
  await keyStore.write("openai", "sk-test-secret");
  assert.equal((await keyStore.read("openai")).apiKey, "sk-test-secret");
  assert.ok(calls.every(([command]) => command === "/usr/bin/security"));
});

test("Windows key store persists only a DPAPI-protected value", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "autumn-apply-windows-key-"));
  const secretPath = path.join(directory, "provider-secrets.json");
  const keyStore = createKeyStore({
    platform: "win32",
    env: {},
    secretPath,
    windowsDpapi: {
      protect: async (value) => Buffer.from(`protected:${value}`).toString("base64"),
      unprotect: async (value) => Buffer.from(value, "base64").toString("utf8").replace(/^protected:/, ""),
    },
  });
  await keyStore.write("deepseek", "sk-windows-secret");
  const raw = await readFile(secretPath, "utf8");
  assert.doesNotMatch(raw, /sk-windows-secret/);
  assert.deepEqual(await keyStore.read("deepseek"), { apiKey: "sk-windows-secret", source: "windows-dpapi" });
  await keyStore.remove("deepseek");
  assert.deepEqual(await keyStore.read("deepseek"), { apiKey: "", source: "none" });
});

test("Windows DPAPI performs a current-user round trip", { skip: process.platform !== "win32" }, async () => {
  const dpapi = createWindowsDpapi();
  const encrypted = await dpapi.protect("sk-round-trip-secret");
  assert.notEqual(encrypted, "sk-round-trip-secret");
  assert.equal(await dpapi.unprotect(encrypted), "sk-round-trip-secret");
});

test("settings persist only non-secret fields with restrictive permissions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "autumn-apply-settings-"));
  const configPath = path.join(directory, "provider.json");
  let secret = "";
  const keyStore = {
    persistent: true,
    read: async () => ({ apiKey: secret, source: secret ? "test" : "none" }),
    write: async (_provider, value) => { secret = value; },
    remove: async () => { secret = ""; },
  };
  const store = createProviderSettingsStore({ configPath, keyStore });
  const status = await store.update({ provider: "deepseek", model: "deepseek-flash", apiKey: "secret-value" });
  assert.equal(status.apiKeyConfigured, true);
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).apiKey, undefined);
  if (process.platform !== "win32") assert.equal((await stat(configPath)).mode & 0o777, 0o600);
});
