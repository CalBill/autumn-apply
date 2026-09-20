import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const KEYCHAIN_SERVICE = "dev.autumn-apply.api-key";

export const PROVIDERS = Object.freeze({
  openai: { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", envKey: "OPENAI_API_KEY" },
  deepseek: { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", envKey: "DEEPSEEK_API_KEY" },
});

function defaultConfigPath() {
  return process.env.AUTUMN_APPLY_CONFIG_DIR
    ? path.join(process.env.AUTUMN_APPLY_CONFIG_DIR, "provider.json")
    : path.join(os.homedir(), ".config", "autumn-apply", "provider.json");
}

export function normalizeProviderConfig(value = {}) {
  const provider = PROVIDERS[value.provider] ?? PROVIDERS.openai;
  const model = String(value.model || provider.model).trim().slice(0, 120);
  const baseUrl = String(value.baseUrl || provider.baseUrl).trim().replace(/\/$/, "");
  if (baseUrl !== provider.baseUrl) throw new Error(`${provider.label} 仅允许使用官方 API 地址`);
  if (!model || !/^[A-Za-z0-9._:/-]+$/.test(model)) throw new Error("模型名称格式不正确");
  return { provider: provider.id, baseUrl, model };
}

export function createKeyStore({ platform = process.platform, run = execFile, env = process.env } = {}) {
  async function read(providerId) {
    const provider = PROVIDERS[providerId];
    if (!provider) return { apiKey: "", source: "none" };
    if (env[provider.envKey]) return { apiKey: env[provider.envKey], source: "environment" };
    if (platform !== "darwin") return { apiKey: "", source: "none" };
    try {
      const { stdout } = await run("/usr/bin/security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", providerId, "-w"]);
      return { apiKey: String(stdout).trim(), source: "keychain" };
    } catch {
      return { apiKey: "", source: "none" };
    }
  }

  async function write(providerId, apiKey) {
    if (!PROVIDERS[providerId]) throw new Error("不支持的模型服务商");
    const value = String(apiKey ?? "").trim();
    if (value.length < 8 || value.length > 512) throw new Error("API Key 长度不正确");
    if (platform !== "darwin") throw new Error(`当前系统不支持持久化密钥，请改用 ${PROVIDERS[providerId].envKey} 环境变量`);
    await run("/usr/bin/security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", providerId, "-w", value]);
  }

  async function remove(providerId) {
    if (platform !== "darwin") return;
    try {
      await run("/usr/bin/security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", providerId]);
    } catch (error) {
      if (![44, 45].includes(error.code)) throw error;
    }
  }

  return { read, write, remove, persistent: platform === "darwin" };
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
    return { ...config, apiKeyConfigured: Boolean(secret.apiKey), apiKeySource: secret.source, persistentKeyStorage: keyStore.persistent };
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
