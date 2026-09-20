import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { sanitizeProfileForModel } from "./ai-workflows.js";

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

export async function searchJobsWithAi({ profile, instructions = {}, model, provider, fetchImpl = fetch, resolveHost } = {}) {
  if (provider !== "openai") throw Object.assign(new Error("当前仅OpenAI配置支持托管网页搜索；DeepSeek仍可用于简历结构化和岗位匹配"), { statusCode: 409 });
  const safeProfile = sanitizeProfileForModel(profile);
  const query = {
    roles: Array.isArray(instructions.roles) ? instructions.roles.slice(0, 10) : safeProfile.preferences.roles,
    locations: Array.isArray(instructions.locations) ? instructions.locations.slice(0, 10) : safeProfile.preferences.locations,
    requiredKeywords: Array.isArray(instructions.requiredKeywords) ? instructions.requiredKeywords.slice(0, 15) : [],
    excludedKeywords: Array.isArray(instructions.excludedKeywords) ? instructions.excludedKeywords.slice(0, 20) : [],
    graduationYear: safeProfile.preferences.graduationYear,
    maximumResults: Math.min(20, Math.max(1, Number(instructions.maximumResults) || 10)),
  };
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
