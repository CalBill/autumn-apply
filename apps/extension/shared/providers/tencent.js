// Tencent provider adapted from JiemsLBJ/offer-harvester at
// cd0086ea48786c0216e6a5905be613bcfa8471cd (MIT).
// This browser version keeps only public, read-only discovery and detail fetching.

const API_ORIGIN = "https://careers.tencent.com/tencentcareer/api/post";

function cleanHtml(value) {
  return String(value ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&semi;/g, ";")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDate(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})(?:\s*年|-)(\d{1,2})(?:\s*月|-)(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
}

function canonicalUrl(id) {
  return `https://careers.tencent.com/jobdesc.html?postId=${encodeURIComponent(id)}`;
}

export function normalizeTencentListPost(post = {}) {
  const id = String(post.PostId ?? "").trim();
  const title = String(post.RecruitPostName ?? "").trim();
  if (!id || !title) return null;
  return {
    id: `tencent:${id}`,
    providerId: id,
    sourcePlatform: "腾讯招聘",
    sourceUrl: canonicalUrl(id),
    title,
    company: String(post.ComName ?? "").trim() || "腾讯",
    location: [post.CountryName, post.LocationName].filter(Boolean).join(" · "),
    description: "",
    publishedAt: normalizeDate(post.LastUpdateTime),
    metadata: {
      businessGroup: String(post.BGName ?? "").trim(),
      category: String(post.CategoryName ?? "").trim(),
      product: String(post.ProductName ?? "").trim(),
      experience: String(post.RequireWorkYearsName ?? "").trim(),
    },
  };
}

async function readJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json, text/plain, */*" },
  });
  if (!response.ok) throw new Error(`腾讯招聘请求失败：HTTP ${response.status}`);
  const body = await response.json();
  if (body?.Code !== 200) throw new Error(`腾讯招聘接口返回 Code=${body?.Code ?? "unknown"}`);
  return body.Data;
}

export async function searchTencentJobs({ query, page = 1, pageSize = 100 }, fetchImpl = fetch) {
  const params = new URLSearchParams({
    timestamp: String(Date.now()),
    countryId: "",
    cityId: "",
    bgIds: "",
    productId: "",
    categoryId: "",
    parentCategoryId: "",
    attrId: "",
    keyword: query,
    pageIndex: String(page),
    pageSize: String(Math.min(100, Math.max(1, pageSize))),
    language: "zh-cn",
    area: "cn",
  });
  const data = await readJson(`${API_ORIGIN}/Query?${params}`, fetchImpl);
  const jobs = (data?.Posts ?? []).map(normalizeTencentListPost).filter(Boolean);
  return { jobs, total: Number(data?.Count) || jobs.length, page };
}

export async function fetchTencentJobDetail(providerId, fetchImpl = fetch) {
  const data = await readJson(`${API_ORIGIN}/ByPostId?postId=${encodeURIComponent(providerId)}`, fetchImpl);
  const summary = normalizeTencentListPost({ ...data, PostId: data?.PostId ?? providerId });
  if (!summary) throw new Error("腾讯岗位详情缺少岗位编号或名称");
  return {
    ...summary,
    description: cleanHtml([data.Responsibility, data.Requirement, data.Introduction].filter(Boolean).join("\n\n")),
  };
}

export const tencentProvider = {
  id: "tencent",
  name: "腾讯招聘",
  search: searchTencentJobs,
  detail: (job) => fetchTencentJobDetail(job.providerId),
};
