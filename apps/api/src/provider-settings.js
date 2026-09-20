import { execFile as execFileCallback, spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const KEYCHAIN_SERVICE = "dev.autumn-apply.api-key";
const DPAPI_PROTECT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Security",
  "$plain = [Console]::In.ReadToEnd()",
  "$bytes = [Text.Encoding]::UTF8.GetBytes($plain)",
  "$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($protected))",
].join("; ");
const DPAPI_UNPROTECT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Security",
  "$ciphertext = [Console]::In.ReadToEnd()",
  "$protected = [Convert]::FromBase64String($ciphertext)",
  "$bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))",
].join("; ");

export const PROVIDERS = Object.freeze({
  openai: { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", envKey: "OPENAI_API_KEY", webSearch: true },
  deepseek: { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", envKey: "DEEPSEEK_API_KEY", webSearch: false },
});

function defaultConfigDirectory({ platform = process.platform, env = process.env } = {}) {
  if (env.AUTUMN_APPLY_CONFIG_DIR) return env.AUTUMN_APPLY_CONFIG_DIR;
  if (platform === "win32" && env.APPDATA) return path.join(env.APPDATA, "AutumnApply");
  return path.join(os.homedir(), ".config", "autumn-apply");
}

function defaultConfigPath(options) {
  return path.join(defaultConfigDirectory(options), "provider.json");
}

function defaultSecretPath(options) {
  return path.join(defaultConfigDirectory(options), "provider-secrets.json");
}

function runPowerShell(script, input, start = spawn) {
  return new Promise((resolvePromise, rejectPromise) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = start("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("close", (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else rejectPromise(new Error(`Windows 安全存储操作失败${stderr.trim() ? `：${stderr.trim().slice(0, 200)}` : ""}`));
    });
    child.stdin.end(input, "utf8");
  });
}

export function createWindowsDpapi({ run = runPowerShell } = {}) {
  return {
    protect: (value) => run(DPAPI_PROTECT_SCRIPT, value),
    unprotect: (value) => run(DPAPI_UNPROTECT_SCRIPT, value),
  };
}

export function normalizeProviderConfig(value = {}) {
  const provider = PROVIDERS[value.provider] ?? PROVIDERS.openai;
  const model = String(value.model || provider.model).trim().slice(0, 120);
  const baseUrl = String(value.baseUrl || provider.baseUrl).trim().replace(/\/$/, "");
  if (baseUrl !== provider.baseUrl) throw new Error(`${provider.label} 仅允许使用官方 API 地址`);
  if (!model || !/^[A-Za-z0-9._:/-]+$/.test(model)) throw new Error("模型名称格式不正确");
  return { provider: provider.id, baseUrl, model };
}

export function createKeyStore({
  platform = process.platform,
  run = execFile,
  env = process.env,
  secretPath = defaultSecretPath({ platform, env }),
  windowsDpapi = createWindowsDpapi(),
} = {}) {
  async function readWindowsSecrets() {
    try {
      const parsed = JSON.parse(await readFile(secretPath, "utf8"));
      return parsed?.version === 1 && parsed.keys && typeof parsed.keys === "object" ? parsed.keys : {};
    } catch (error) {
      if (error.code === "ENOENT") return {};
      if (error instanceof SyntaxError) throw new Error("Windows 加密密钥文件格式无效");
      throw error;
    }
  }

  async function writeWindowsSecrets(keys) {
    await mkdir(path.dirname(secretPath), { recursive: true, mode: 0o700 });
    const temporary = `${secretPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, keys }, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, secretPath);
  }

  async function read(providerId) {
    const provider = PROVIDERS[providerId];
    if (!provider) return { apiKey: "", source: "none" };
    if (env[provider.envKey]) return { apiKey: env[provider.envKey], source: "environment" };
    if (platform === "darwin") {
      try {
        const { stdout } = await run("/usr/bin/security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", providerId, "-w"]);
        return { apiKey: String(stdout).trim(), source: "keychain" };
      } catch {
        return { apiKey: "", source: "none" };
      }
    }
    if (platform === "win32") {
      const encrypted = (await readWindowsSecrets())[providerId];
      if (!encrypted) return { apiKey: "", source: "none" };
      try {
        return { apiKey: await windowsDpapi.unprotect(String(encrypted)), source: "windows-dpapi" };
      } catch {
        throw new Error("Windows 加密密钥无法由当前用户解密");
      }
    }
    return { apiKey: "", source: "none" };
  }

  async function write(providerId, apiKey) {
    if (!PROVIDERS[providerId]) throw new Error("不支持的模型服务商");
    const value = String(apiKey ?? "").trim();
    if (value.length < 8 || value.length > 512) throw new Error("API Key 长度不正确");
    if (platform === "darwin") {
      await run("/usr/bin/security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", providerId, "-w", value]);
      return;
    }
    if (platform === "win32") {
      const keys = await readWindowsSecrets();
      keys[providerId] = await windowsDpapi.protect(value);
      await writeWindowsSecrets(keys);
      return;
    }
    throw new Error(`当前系统不支持持久化密钥，请改用 ${PROVIDERS[providerId].envKey} 环境变量`);
  }

  async function remove(providerId) {
    if (platform === "darwin") {
      try {
        await run("/usr/bin/security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", providerId]);
      } catch (error) {
        if (![44, 45].includes(error.code)) throw error;
      }
      return;
    }
    if (platform === "win32") {
      const keys = await readWindowsSecrets();
      delete keys[providerId];
      if (Object.keys(keys).length) await writeWindowsSecrets(keys);
      else {
        try {
          await unlink(secretPath);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    }
  }

  return { read, write, remove, persistent: platform === "darwin" || platform === "win32" };
}

export function createProviderSettingsStore({ configPath = defaultConfigPath(), keyStore = createKeyStore() } = {}) {
  async function readConfig() {
    try {
      return normalizeProviderConfig(JSON.parse(await readFile(configPath, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") return normalizeProviderConfig();
      if (error instanceof SyntaxError) throw new Error("本机模型配置文件不是有效 JSON");
      throw error;
    }
  }

  async function writeConfig(value) {
    const config = normalizeProviderConfig(value);
    await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
    const temporary = `${configPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, configPath);
    await chmod(configPath, 0o600);
    return config;
  }

  async function status() {
    const config = await readConfig();
    const secret = await keyStore.read(config.provider);
    return { ...config, apiKeyConfigured: Boolean(secret.apiKey), apiKeySource: secret.source, persistentKeyStorage: keyStore.persistent, capabilities: { webSearch: PROVIDERS[config.provider].webSearch } };
  }

  async function update(value) {
    const config = await writeConfig(value);
    if (value.apiKey) await keyStore.write(config.provider, value.apiKey);
    return status();
  }

  async function removeKey() {
    const config = await readConfig();
    await keyStore.remove(config.provider);
    return status();
  }

  async function credentials() {
    const config = await readConfig();
    const secret = await keyStore.read(config.provider);
    if (!secret.apiKey) throw Object.assign(new Error(`尚未配置 ${PROVIDERS[config.provider].label} API Key`), { statusCode: 409 });
    return { ...config, apiKey: secret.apiKey };
  }

  return { readConfig, writeConfig, status, update, removeKey, credentials, configPath };
}
