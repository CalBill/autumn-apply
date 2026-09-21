// Search and parsing strategy adapted from WupfAGI/wechat-search-skill at
// b8df02cffd3925ba655796ace74f48b24ae85d47 (MIT).
// This browser port performs a small, bounded batch of sequential, read-only
// Sogou Weixin requests. It never bypasses CAPTCHA or retries rate limits.

import { simpleHash } from "../job.js";
import { plainText } from "./company-careers.js";

const SEARCH_URL = "https://weixin.sogou.com/weixin";
const RECRUITMENT_SIGNALS = ["校招", "秋招", "春招", "招聘", "实习", "提前批", "网申", "岗位", "招募", "应届"];
const OPPORTUNITY_SIGNALS = ["招聘", "招募", "启动", "投递", "网申", "报名", "应聘", "岗位", "职位", "截止"];
const ADVICE_SIGNALS = ["经验分享", "知识点", "面试题", "笔试题", "复盘", "技能清单", "必备技能", "能力拆解", "求职攻略"];
const NOISE_SIGNALS = ["免费领取", "点击领取", "扫码领取", "限时福利", "0元领", "商务合作", "广告投放"];
const ROUNDUP_SIGNALS = ["汇总", "合集", "岗位表", "信息表", "每日校招", "本周校招", "多家企业", "一周招聘"];
const LOCATION_NAMES = [
  "北京", "上海", "天津", "重庆", "深圳", "广州", "杭州", "南京", "苏州", "成都", "武汉", "西安", "长沙",
  "合肥", "厦门", "福州", "青岛", "济南", "郑州", "宁波", "无锡", "东莞", "佛山", "珠海", "香港", "澳门",
];
const ROLE_ALIASES = {
  金融: ["证券", "基金", "银行", "投融资", "资产管理"],
  PEVC: ["PE", "VC", "私募股权", "创业投资"],
  IBD: ["投行", "投资银行", "投融资"],
  人力资源: ["人力", "HR", "组织发展"],
  合规: ["风控", "内控", "法律合规"],
  管培生: ["管理培训生", "管培"],
};

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

function firstMatch(html, expression) {
  return html.match(expression)?.[1] ?? "";
}

function absoluteSogouUrl(value) {
  try {
    return new URL(value, "https://weixin.sogou.com").href;
  } catch {
    return "https://weixin.sogou.com/";
  }
}

function publicationDate(html) {
  const timestamp = html.match(/timeConvert\(['"](\d+)['"]\)/)?.[1];
  if (timestamp) return new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  const visible = plainText(firstMatch(html, /<span\b[^>]*class=["'][^"']*\bs2\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
  const match = visible.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
}

function extractLocations(value) {
  return LOCATION_NAMES.filter((location) => value.includes(location)).join("/");
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map(compact).filter(Boolean))];
}

function articleType(title, abstract) {
  const content = `${title} ${abstract}`;
  if (ROUNDUP_SIGNALS.some((signal) => content.includes(signal))) return "roundup";
  if (content.includes("提前批")) return "early-batch";
  if (content.includes("实习")) return "internship";
  if (/宣讲|双选会|招聘会/.test(content)) return "event";
  return "company-announcement";
}

function inferCompany(title, account) {
  const cleaned = compact(title)
    .replace(/^【[^】]{1,24}】/, "")
    .replace(/^(?:招聘信息|校园招聘|名企校招|招聘)\s*[丨|｜:：-]\s*/i, "");
  const segment = cleaned.split(/[丨|｜]/).at(-1).trim();
  const marker = segment.search(/20\d{2}\s*届|校园招聘|校招|招聘|招募|管培生计划/);
  const candidate = compact(marker > 0 ? segment.slice(0, marker) : segment);
  if (candidate.length >= 2 && candidate.length <= 30 && !/^(?:秋季|春季|秋招|春招|应届生|校园)$/.test(candidate)) return candidate;
  return account || "待核验公众号";
}

function extractDeadline(content, publishedAt) {
  const full = content.match(/(?:投递|网申|报名)?截止(?:日期|时间)?[^0-9]{0,10}(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
  const partial = content.match(/(?:投递|网申|报名)?截止(?:日期|时间)?[^0-9]{0,10}(\d{1,2})月(\d{1,2})日/);
  const values = full
    ? [full[1], full[2], full[3]]
    : partial && publishedAt
      ? [publishedAt.slice(0, 4), partial[1], partial[2]]
      : null;
  if (!values) return null;
  const result = `${values[0]}-${values[1].padStart(2, "0")}-${values[2].padStart(2, "0")}`;
  return Number.isFinite(Date.parse(`${result}T00:00:00+08:00`)) ? result : null;
}

function searchUrl(query) {
  const params = new URLSearchParams({ type: "2", query, ie: "utf8" });
  return `${SEARCH_URL}?${params}`;
}

export function buildWechatSearchPlan({
  query = "",
  queries = [],
  graduationYear = "",
  locations = [],
  industries = [],
  companyTypes = [],
  focusKeywords = [],
  maxRequests = 10,
} = {}) {
  const roles = unique([...(Array.isArray(queries) ? queries : []), query]).slice(0, 3);
  const cohort = graduationYear ? `${graduationYear}届` : "应届生";
  const planned = [];
  for (const role of roles) planned.push(`${role} ${cohort} 校招`);
  for (const keyword of unique(focusKeywords).slice(0, 3)) {
    planned.push(`${keyword} ${cohort} 招聘`);
    planned.push(`${keyword} 校招`);
  }
  for (const role of roles) {
    planned.push(`${role} 校园招聘`);
    planned.push(`${role} 秋招`);
  }
  for (let index = 0; index < Math.min(roles.length, locations.length); index += 1) {
    planned.push(`${locations[index]} ${roles[index]} ${cohort} 招聘`);
  }
  const aliases = unique(roles.flatMap((role) => ROLE_ALIASES[role.toUpperCase()] ?? ROLE_ALIASES[role] ?? [])).slice(0, 3);
  for (const alias of aliases) planned.push(`${alias} ${cohort} 校招`);
  const preferenceTerms = unique([...companyTypes, ...industries]).slice(0, 2);
  if (preferenceTerms.length) planned.push(`${preferenceTerms.join(" ")} ${cohort} 校招`);
  // A cohort may not yet have many exact hits. Generic campus-recruitment
  // queries make WeChat discovery useful instead of returning an opaque zero.
  planned.push(`${cohort} 秋招`);
  return unique(planned).slice(0, Math.min(10, Math.max(1, Number(maxRequests) || 10)));
}

export function isRecruitmentArticle(title, abstract) {
  const content = `${title} ${abstract}`;
  return RECRUITMENT_SIGNALS.some((signal) => content.includes(signal))
    && OPPORTUNITY_SIGNALS.some((signal) => content.includes(signal))
    && !ADVICE_SIGNALS.some((signal) => title.includes(signal))
    && !NOISE_SIGNALS.some((signal) => title.includes(signal));
}

export function parseSogouWechatArticles(html, query = "") {
  if (typeof html !== "string") return [];
  const list = firstMatch(html, /<ul\b[^>]*class=["'][^"']*\bnews-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i) || html;
  const items = list.match(/<li\b[\s\S]*?<\/li>/gi) ?? [];
  const results = [];

  for (const item of items) {
    const heading = firstMatch(item, /<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    const anchor = heading.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const title = plainText(anchor?.[2]);
    const href = plainText(attribute(anchor?.[1] ?? "", "href"));
    const abstract = plainText(firstMatch(item, /<p\b[^>]*class=["'][^"']*\btxt-info\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)).slice(0, 800);
    const account = plainText(firstMatch(item, /<span\b[^>]*class=["'][^"']*\ball-time-y2\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    if (!title || !href || !isRecruitmentArticle(title, abstract)) continue;
    const sourceUrl = absoluteSogouUrl(href);
    const content = `${title} ${abstract}`;
    const publishedAt = publicationDate(item);
    const kind = articleType(title, abstract);
    const location = extractLocations(content);
    const company = inferCompany(title, account);
    const queryTerms = query.split(/\s+/).filter((term) => term.length >= 2);
    const qualityScore = Math.min(100, 45
      + (/(?:20\d{2}\s*届|应届生)/.test(content) ? 15 : 0)
      + (OPPORTUNITY_SIGNALS.some((signal) => title.includes(signal)) ? 15 : 0)
      + (queryTerms.some((term) => content.includes(term)) ? 10 : 0)
      + (location ? 5 : 0)
      - (kind === "roundup" ? 8 : 0)
      - (/进群|回复【|后台回复|扫码/.test(abstract) ? 8 : 0));
    results.push({
      id: `wechat:sogou:${simpleHash(`${compact(title).toLocaleLowerCase()}|${company}|${publishedAt ?? ""}`)}`,
      providerId: sourceUrl,
      sourcePlatform: "微信公众号 · 搜狗微信",
      sourceName: account || "微信公众号",
      sourceType: "wechat-article",
      sourceVerified: false,
      sourceUrl,
      title,
      company,
      location,
      description: abstract,
      publishedAt,
      deadline: extractDeadline(content, publishedAt),
      metadata: {
        provider: "sogou-weixin",
        account,
        seenAccounts: account ? [account] : [],
        query,
        matchedQueries: [query],
        articleType: kind,
        qualityScore,
        fallbackSearchUrl: searchUrl(title),
        recordType: "recruitment-announcement",
      },
    });
  }
  return results;
}

async function fetchWechatSearchPage(recruitmentQuery, page, fetchImpl) {
  const params = new URLSearchParams({ type: "2", query: recruitmentQuery, page: String(Math.max(1, page)), ie: "utf8", tsn: "1" });
  const response = await fetchImpl(`${SEARCH_URL}?${params}`, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (response.status === 403 || response.status === 429) throw new Error("搜狗微信限制了请求，请稍后重试或在浏览器中人工搜索");
  if (!response.ok) throw new Error(`搜狗微信请求失败：HTTP ${response.status}`);
  const html = await response.text();
  if (/验证码|请输入验证码|captcha|antispider/i.test(`${response.url ?? ""}\n${html}`)) {
    throw new Error("搜狗微信要求验证码；系统不会绕过，请稍后重试或人工打开搜索页");
  }
  if (!/\bnews-list\b/i.test(html) && /id=["']searchForm["']/i.test(html) && !/没有找到|暂无相关/i.test(html)) {
    throw new Error("搜狗微信返回了搜索首页，可能触发临时访问限制；请稍后重试或人工搜索");
  }
  return parseSogouWechatArticles(html, recruitmentQuery);
}

function mergeArticle(current, incoming) {
  if (!current) return incoming;
  const matchedQueries = unique([
    ...(current.metadata?.matchedQueries ?? []),
    ...(incoming.metadata?.matchedQueries ?? []),
  ]);
  const seenAccounts = unique([
    ...(current.metadata?.seenAccounts ?? []),
    ...(incoming.metadata?.seenAccounts ?? []),
  ]);
  const preferred = (incoming.metadata?.qualityScore ?? 0) > (current.metadata?.qualityScore ?? 0) ? incoming : current;
  return { ...preferred, metadata: { ...preferred.metadata, matchedQueries, seenAccounts } };
}

export async function searchWechatArticles(input, fetchImpl = fetch) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(input.pageSize) || 20));
  const searchPlan = buildWechatSearchPlan(input);
  const articles = new Map();
  const warnings = [];
  const searchedQueries = [];
  for (const recruitmentQuery of searchPlan) {
    try {
      const jobs = await fetchWechatSearchPage(recruitmentQuery, page, fetchImpl);
      searchedQueries.push(recruitmentQuery);
      for (const job of jobs) articles.set(job.id, mergeArticle(articles.get(job.id), job));
    } catch (error) {
      warnings.push(`${recruitmentQuery}：${error.message}`);
      // Do not retry or try to bypass anti-bot checks. Surface the source
      // limitation, preserve any earlier leads, and stop this low-frequency run.
      break;
    }
  }
  const jobs = [...articles.values()].sort((a, b) => {
    const quality = (b.metadata?.qualityScore ?? 0) - (a.metadata?.qualityScore ?? 0);
    if (quality) return quality;
    return String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""));
  }).slice(0, pageSize);
  return { jobs, total: jobs.length, page, searchPlan, searchedQueries, warnings };
}

export function createWechatProvider(fetchImpl = fetch) {
  return {
    id: "wechat-sogou",
    name: "微信公众号",
    kind: "wechat-article",
    batchSearch: true,
    search: (input) => searchWechatArticles(input, fetchImpl),
    detail: async (article) => article,
  };
}
