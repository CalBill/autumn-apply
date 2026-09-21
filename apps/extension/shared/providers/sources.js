import { createCompanyProvider, resolveBoard } from "./company-careers.js";
import { fetchTencentJobDetail, tencentProvider } from "./tencent.js";
import { createWechatProvider } from "./wechat.js";
import { simpleHash } from "../job.js";

// Every entry must be verified from an official company recruitment entry point.
// A source URL is configuration, not proof that an unsupported ATS works.
export const OFFICIAL_COMPANY_SOURCES = Object.freeze([
  { id: "meituan", name: "美团", url: "https://zhaopin.meituan.com/web/social", enabled: true },
  { id: "deepseek", name: "DeepSeek", url: "https://app.mokahr.com/social-recruitment/high-flyer/140576", enabled: true },
  { id: "moonshot", name: "月之暗面", url: "https://app.mokahr.com/apply/moonshot/148506", enabled: true },
  { id: "zhipu", name: "智谱AI", url: "https://app.mokahr.com/social-recruitment/zphz/148983", enabled: true },
  { id: "bytedance", name: "字节跳动", url: "https://jobs.bytedance.com", enabled: false, note: "公开接口可能拒绝普通浏览器请求" },
  { id: "minimax", name: "MiniMax", url: "https://vrfi1sk8a0.jobs.feishu.cn", enabled: false, note: "公开接口可能拒绝普通浏览器请求" },
]);

export function parseCompanySourceText(value = "") {
  const sources = [];
  const errors = [];
  for (const [index, rawLine] of String(value).split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("|");
    if (separator === -1) {
      errors.push(`第 ${index + 1} 行应使用“公司名 | 官方招聘 URL”格式`);
      continue;
    }
    const name = line.slice(0, separator).trim();
    const url = line.slice(separator + 1).trim();
    if (!name || !url) {
      errors.push(`第 ${index + 1} 行缺少公司名或 URL`);
      continue;
    }
    try {
      const source = { id: `custom-${simpleHash(`${name}|${url}`)}`, name: name.slice(0, 80), url, enabled: true };
      // Validation also prevents arbitrary endpoints, credentials and HTTP URLs.
      resolveBoard(source);
      sources.push(source);
    } catch (error) {
      errors.push(`第 ${index + 1} 行：${error.message}`);
    }
  }
  return { sources, errors };
}

export function serializeCompanySources(sources = []) {
  return sources.map((source) => `${source.name} | ${source.url}`).join("\n");
}

export function createOfficialProviders(fetchImpl = fetch, customSources = []) {
  const uniqueSources = [...new Map(
    [...OFFICIAL_COMPANY_SOURCES.filter((source) => source.enabled), ...customSources]
      .map((source) => [source.url, source]),
  ).values()];
  return [
    {
      ...tencentProvider,
      search: (input) => tencentProvider.search(input, fetchImpl),
      detail: (job) => fetchTencentJobDetail(job.providerId, fetchImpl),
    },
    ...uniqueSources.map((source) => createCompanyProvider(source, fetchImpl)),
  ];
}

export function createDiscoveryProviders(fetchImpl = fetch, customSources = [], importedWechatArticles = []) {
  return [...createOfficialProviders(fetchImpl, customSources), createWechatProvider(fetchImpl, importedWechatArticles)];
}
