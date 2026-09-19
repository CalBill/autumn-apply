// Search and parsing strategy adapted from WupfAGI/wechat-search-skill at
// b8df02cffd3925ba655796ace74f48b24ae85d47 (MIT).
// This browser port performs one low-rate, read-only Sogou Weixin request per
// query. It never bypasses CAPTCHA or retries rate limits.

import { simpleHash } from "../job.js";
import { plainText } from "./company-careers.js";

const SEARCH_URL = "https://weixin.sogou.com/weixin";
const RECRUITMENT_SIGNALS = ["校招", "秋招", "春招", "招聘", "实习", "提前批", "网申", "岗位", "招募", "应届"];
const OPPORTUNITY_SIGNALS = ["招聘", "招募", "启动", "投递", "网申", "报名", "应聘", "岗位", "职位", "截止"];
const ADVICE_SIGNALS = ["经验分享", "知识点", "面试题", "笔试题", "复盘", "技能清单", "必备技能", "能力拆解", "求职攻略"];
const NOISE_SIGNALS = ["免费领取", "点击领取", "扫码领取", "限时福利", "0元领", "商务合作", "广告投放"];
const LOCATION_NAMES = [
  "北京", "上海", "天津", "重庆", "深圳", "广州", "杭州", "南京", "苏州", "成都", "武汉", "西安", "长沙",
  "合肥", "厦门", "福州", "青岛", "济南", "郑州", "宁波", "无锡", "东莞", "佛山", "珠海", "香港", "澳门",
];

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
    results.push({
      id: `wechat:sogou:${simpleHash(`${sourceUrl}|${title}|${account}`)}`,
      providerId: sourceUrl,
      sourcePlatform: "微信公众号 · 搜狗微信",
      sourceName: account || "微信公众号",
      sourceType: "wechat-article",
      sourceVerified: false,
      sourceUrl,
      title,
      company: account || "待核验公众号",
      location: extractLocations(content),
      description: abstract,
      publishedAt: publicationDate(item),
      metadata: { provider: "sogou-weixin", account, query, recordType: "recruitment-announcement" },
    });
  }
  return results;
}

export async function searchWechatArticles({ query, graduationYear = "", page = 1, pageSize = 20 }, fetchImpl = fetch) {
  const yearSignal = graduationYear && !query.includes(graduationYear) ? `${graduationYear}届 ` : "";
  const recruitmentQuery = RECRUITMENT_SIGNALS.some((signal) => query.includes(signal)) ? query : `${query} ${yearSignal}校招`;
  const params = new URLSearchParams({ type: "2", query: recruitmentQuery, page: String(Math.max(1, page)), ie: "utf8" });
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
  const jobs = parseSogouWechatArticles(html, query).slice(0, Math.min(20, Math.max(1, pageSize)));
  return { jobs, total: jobs.length, page };
}

export function createWechatProvider(fetchImpl = fetch) {
  return {
    id: "wechat-sogou",
    name: "微信公众号",
    kind: "wechat-article",
    search: (input) => searchWechatArticles(input, fetchImpl),
    detail: async (article) => article,
  };
}
