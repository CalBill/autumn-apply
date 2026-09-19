import { createCompanyProvider } from "./company-careers.js";
import { fetchTencentJobDetail, tencentProvider } from "./tencent.js";
import { createWechatProvider } from "./wechat.js";

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

export function createOfficialProviders(fetchImpl = fetch) {
  return [
    {
      ...tencentProvider,
      search: (input) => tencentProvider.search(input, fetchImpl),
      detail: (job) => fetchTencentJobDetail(job.providerId, fetchImpl),
    },
    ...OFFICIAL_COMPANY_SOURCES.filter((source) => source.enabled).map((source) => createCompanyProvider(source, fetchImpl)),
  ];
}

export function createDiscoveryProviders(fetchImpl = fetch) {
  return [...createOfficialProviders(fetchImpl), createWechatProvider(fetchImpl)];
}
