import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { sanitizeProfileForModel } from "./ai-workflows.js";
import { analyzeJob } from "../../extension/shared/matcher.js";

const STRING = { type: "string" };
const SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: STRING, title: STRING, location: STRING, description: STRING, sourceUrl: STRING, sourceTitle: STRING,
          publishedAt: STRING, deadline: STRING, matchScore: { type: "integer", minimum: 0, maximum: 100 },
          matchReason: STRING, hardRequirementRisk: STRING,
        },
        required: ["company", "title", "location", "description", "sourceUrl", "sourceTitle", "publishedAt", "deadline", "matchScore", "matchReason", "hardRequirementRisk"],
      },
    },
  },
  required: ["opportunities"],
};

function privateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(address)) {
    const value = address.toLocaleLowerCase();
    return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
  }
  return true;
}

export async function validatePublicUrl(value, resolveHost = (hostname) => lookup(hostname, { all: true })) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("来源链接不是有效URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("来源链接必须是无凭据的HTTPS地址");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("来源链接不能指向本机地址");
  const addresses = await resolveHost(url.hostname);
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error("来源链接解析到了非公网地址");
  return url;
}

async function readLimitedText(response, limit = 256_000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  if (size >= limit) await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).subarray(0, limit));
}

function pageContainsSignal(text, opportunity) {
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, "");
  const signals = [opportunity.company, opportunity.title]
    .map((value) => String(value ?? "").toLocaleLowerCase().replace(/\s+/g, ""))
    .filter((value) => value.length >= 2);
  return signals.some((signal) => normalized.includes(signal.slice(0, 12)));
}

export async function verifyOpportunity(opportunity, { fetchImpl = fetch, resolveHost } = {}) {
  let current;
  try {
    current = await validatePublicUrl(opportunity.sourceUrl, resolveHost);
    for (let redirect = 0; redirect < 4; redirect += 1) {
      const response = await fetchImpl(current, {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(12_000),
        headers: { Accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,text/plain;q=0.7" },
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        current = await validatePublicUrl(new URL(response.headers.get("location"), current).href, resolveHost);
        continue;
      }
      if (!response.ok) return { status: "unreachable", finalUrl: current.href, httpStatus: response.status, signalsMatched: false };
      const contentType = response.headers.get("content-type") ?? "";
      const text = /html|text|json/i.test(contentType) ? await readLimitedText(response) : "";
      const signalsMatched = text ? pageContainsSignal(text, opportunity) : false;
      return { status: signalsMatched ? "verified" : "reachable", finalUrl: response.url || current.href, httpStatus: response.status, signalsMatched };
    }
    return { status: "unreachable", finalUrl: current.href, httpStatus: 310, signalsMatched: false };
  } catch (error) {
    return { status: "unreachable", finalUrl: current?.href || String(opportunity.sourceUrl || ""), httpStatus: null, signalsMatched: false, error: error.message };
  }
}

function collectWebSources(raw) {
  const sources = new Set();
  function visit(value, trusted = false) {
    if (!value || typeof value !== "object") return;
    const nextTrusted = trusted || value.type === "web_search_call" || value.type === "url_citation" || Array.isArray(value.sources);
    if (nextTrusted && typeof value.url === "string" && value.url.startsWith("https://")) sources.add(value.url);
    for (const [key, child] of Object.entries(value)) {
      if (key === "input" || key === "instructions") continue;
      if (Array.isArray(child)) child.forEach((item) => visit(item, nextTrusted || key === "sources" || key === "annotations"));
      else if (child && typeof child === "object") visit(child, nextTrusted || key === "action");
    }
  }
  visit(raw);
  return [...sources];
}

function sameSource(candidate, sources) {
  if (!sources.length) return true;
  try {
    const url = new URL(candidate);
    return sources.some((source) => {
      const cited = new URL(source);
      return cited.hostname === url.hostname && (cited.pathname === url.pathname || cited.pathname === "/" || url.pathname === "/");
    });
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function buildZhipuQueries(query) {
  const cohort = query.graduationYear ? `${query.graduationYear}届` : "应届生";
  const roles = query.roles.length ? query.roles.slice(0, 3) : ["管培生"];
  const locations = query.locations.slice(0, 3);
  const preferenceTerms = unique([...query.requiredKeywords, ...query.roles]).slice(0, 3).join(" ");
  const locationSuffix = locations.length ? ` ${locations.join(" ")}` : "";
  const roleQueries = roles.map((role) => `${cohort} 校园招聘 ${role}${locationSuffix} 官方招聘 网申`);
  const broadQuery = `${cohort} 秋招${locationSuffix} ${preferenceTerms} 国企 央企 金融 官方招聘`;
  return unique([...roleQueries, broadQuery]).slice(0, 4);
}

function zhipuResultUrl(result) {
  return String(result?.link ?? result?.url ?? result?.web_url ?? result?.refer ?? result?.source_url ?? "").trim();
}

function collectZhipuSearchResults(raw) {
  const results = [];
  function visit(value, key = "") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (key === "search_result" || key === "search_results") {
      // GLM's current web-search-pro response uses `refer`; older examples use `link`.
      const url = zhipuResultUrl(value);
      if (url.startsWith("https://")) results.push(value);
    }
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  }
  visit(raw);
  return results;
}

function dateFromSearchResult(value) {
  const match = String(value ?? "").match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
}

function locationFromSearchResult(text, locations) {
  return locations.find((location) => String(text).includes(location)) ?? "";
}

function companyFromSearchResult(result, sourceUrl) {
  const named = String(result.media_name ?? result.mediaName ?? result.source ?? result.site_name ?? "").trim();
  if (named) return named.slice(0, 120);
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "待核验招聘来源";
  }
}

async function searchJobsWithZhipu({ profile, query, model, fetchImpl, resolveHost }) {
  if (typeof model?.searchWeb !== "function") throw Object.assign(new Error("智谱 GLM 联网搜索组件不可用，请重新启动本机服务"), { statusCode: 503 });
  const searchQueries = buildZhipuQueries(query);
  const queryResults = await mapWithConcurrency(searchQueries, 2, async (searchQuery) => {
    // web-search-pro is a search tool, not a chat planner: concise search-style queries
    // consistently return its structured `search_result` records. Local filters below
    // enforce the user's exclusions before anything is displayed.
    const response = await model.searchWeb(searchQuery);
    return collectZhipuSearchResults(response.raw);
  });
  const rawResults = queryResults.flat();
  const seen = new Set();
  const candidates = rawResults.filter((result) => {
    const sourceUrl = zhipuResultUrl(result);
    if (!sourceUrl || seen.has(sourceUrl)) return false;
    seen.add(sourceUrl);
    const text = `${result.title ?? ""} ${result.content ?? result.snippet ?? ""}`;
    return !query.excludedKeywords.some((keyword) => keyword && text.includes(keyword));
  }).slice(0, query.maximumResults);
  const opportunities = await mapWithConcurrency(candidates, 5, async (result) => {
    const sourceUrl = zhipuResultUrl(result);
    const title = String(result.title ?? "招聘线索").trim().slice(0, 300);
    const description = String(result.content ?? result.snippet ?? "").trim().slice(0, 8_000);
    const job = {
      title,
      company: companyFromSearchResult(result, sourceUrl),
      location: locationFromSearchResult(`${title} ${description}`, query.locations),
      description,
      sourceUrl,
      publishedAt: dateFromSearchResult(result.publish_date ?? result.publishTime ?? result.time),
    };
    const verification = await verifyOpportunity(job, { fetchImpl, resolveHost });
    const assessment = analyzeJob(job, profile);
    const id = `zhipu-web:${createHash("sha256").update(`${sourceUrl}|${title}`).digest("hex").slice(0, 20)}`;
    return {
      ...job,
      id,
      sourceUrl: verification.finalUrl || sourceUrl,
      sourceTitle: title,
      deadline: "",
      matchScore: assessment.score,
      matchReason: assessment.strengths.join("；") || "来自智谱联网搜索，仍需核验岗位要求",
      hardRequirementRisk: assessment.hardRequirementsMet ? "" : assessment.gaps.join("；"),
      verification,
    };
  });
  return {
    opportunities,
    citedSources: candidates.map(zhipuResultUrl),
    searchStats: { provider: "zhipu", queries: searchQueries.length, returned: rawResults.length, candidates: candidates.length, displayed: opportunities.length },
    searchedAt: new Date().toISOString(),
    disclosedFields: Object.keys(profile),
  };
}

export async function searchJobsWithAi({ profile, instructions = {}, model, provider, fetchImpl = fetch, resolveHost } = {}) {
  const safeProfile = sanitizeProfileForModel(profile);
  const query = {
    roles: Array.isArray(instructions.roles) ? instructions.roles.slice(0, 10) : safeProfile.preferences.roles,
    locations: Array.isArray(instructions.locations) ? instructions.locations.slice(0, 10) : safeProfile.preferences.locations,
    requiredKeywords: Array.isArray(instructions.requiredKeywords) ? instructions.requiredKeywords.slice(0, 15) : [],
    excludedKeywords: Array.isArray(instructions.excludedKeywords) ? instructions.excludedKeywords.slice(0, 20) : [],
    graduationYear: safeProfile.preferences.graduationYear,
    maximumResults: Math.min(20, Math.max(1, Number(instructions.maximumResults) || 10)),
  };
  if (provider === "zhipu") {
    return searchJobsWithZhipu({ profile: safeProfile, query, model, fetchImpl, resolveHost });
  }
  if (provider !== "openai") throw Object.assign(new Error("当前仅 OpenAI 或智谱 GLM 配置支持联网搜索；DeepSeek仍可用于简历结构化和岗位匹配"), { statusCode: 409 });
  const result = await model.generateStructured({
    schemaName: "job_web_search",
    schema: SEARCH_SCHEMA,
    tools: [{ type: "web_search" }],
    toolChoice: "required",
    include: ["web_search_call.action.sources"],
    instructions: "你是中国校园招聘检索助手。搜索当前仍可申请的真实岗位，优先企业官网和官方招聘系统，其次高校就业网。严格执行毕业届别、城市、岗位与排除词；不要返回销售、外包或社会招聘。每个结果必须提供实际查到的来源URL，不得编造链接。描述只概括来源明确写出的事实。",
    input: JSON.stringify({ candidate: safeProfile, search: query, currentDate: new Date().toISOString().slice(0, 10) }),
  });
  const citedSources = collectWebSources(result.raw);
  const candidates = result.data.opportunities.slice(0, query.maximumResults).filter((item) => sameSource(item.sourceUrl, citedSources));
  const opportunities = [];
  for (const item of candidates) {
    const verification = await verifyOpportunity(item, { fetchImpl, resolveHost });
    const id = `ai-web:${createHash("sha256").update(`${item.sourceUrl}|${item.title}`).digest("hex").slice(0, 20)}`;
    opportunities.push({ ...item, id, sourceUrl: verification.finalUrl || item.sourceUrl, verification });
  }
  return { opportunities, citedSources, searchedAt: new Date().toISOString(), disclosedFields: Object.keys(safeProfile) };
}
