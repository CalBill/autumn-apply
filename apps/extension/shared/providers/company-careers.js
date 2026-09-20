// Adapted from JiemsLBJ/offer-harvester at
// cd0086ea48786c0216e6a5905be613bcfa8471cd (MIT).
// The original provider shapes came from career-ops v1.32.0 (MIT).
// This browser port keeps public, read-only discovery only.

function text(value) {
  return typeof value === "string" ? value : "";
}

function names(values) {
  return Array.isArray(values)
    ? values.map((value) => typeof value === "string" ? value : value?.name).filter(Boolean).join("/")
    : "";
}

export function plainText(value) {
  let output = text(value);
  const decode = (input) => input.replace(/&(lt|gt|amp|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (entity, code) => {
    if (code.startsWith("#")) {
      const number = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number)
        : "";
    }
    return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " }[code.toLowerCase()] ?? entity;
  });
  const strip = (input) => input
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')+>/g, " ");
  for (let index = 0; index < 2; index += 1) output = decode(strip(output));
  return strip(output).replace(/<(?=\/?[a-z!?])/gi, "").replace(/\s+/g, " ").trim();
}

export function normalizeDate(value) {
  if (typeof value === "number") {
    const milliseconds = value > 1e12 ? value : value * 1000;
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString().slice(0, 10) : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const calendarDate = value.match(/^(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)/);
    return calendarDate
      ? `${calendarDate[1]}-${calendarDate[2].padStart(2, "0")}-${calendarDate[3].padStart(2, "0")}`
      : null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString().slice(0, 10) : null;
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("Only HTTPS career sources are supported");
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|track|source$|from$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (!(url.hostname === "app.mokahr.com" && /^#\/job\/[^/]+\/?$/.test(url.hash))) url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value;
  }
}

export function resolveBoard(source) {
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("招聘来源必须是无凭据的 HTTPS 地址");
  const slug = url.pathname.split("/").filter(Boolean)[0];
  const common = { origin: url.origin, base: `${url.origin}${url.pathname.replace(/\/$/, "")}`, pageSize: 100 };
  if (url.hostname === "zhaopin.meituan.com") {
    return { ...common, provider: "meituan", api: `${url.origin}/api/official/job/getJobList` };
  }
  if (url.hostname === "jobs.bytedance.com" || /^[a-z0-9-]+\.jobs\.feishu\.cn$/.test(url.hostname)) {
    return { ...common, provider: "feishu", api: `${url.origin}/api/v1/search/job/posts` };
  }
  if (url.hostname === "app.mokahr.com") {
    const match = /^\/(?:social-recruitment|campus-recruitment|apply)\/([a-zA-Z0-9_-]+)\/(\d+)\/?$/.exec(url.pathname);
    if (match && Number.isSafeInteger(Number(match[2])) && Number(match[2]) > 0) {
      return { ...common, provider: "moka", api: `${url.origin}/api/outer/ats-apply/website/jobs/v2`, slug: match[1], siteId: Number(match[2]), pageSize: 50 };
    }
  }
  if (slug && /^[a-zA-Z0-9_-]+$/.test(slug)) {
    if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) {
      return { ...common, provider: "greenhouse", api: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true` };
    }
    if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) {
      return { ...common, provider: "lever", api: `https://api.${url.hostname.slice(5)}/v0/postings/${slug}?mode=json` };
    }
    if (url.hostname === "jobs.ashbyhq.com") {
      return { ...common, provider: "ashby", api: `https://api.ashbyhq.com/posting-api/job-board/${slug}` };
    }
  }
  throw new Error("尚未支持该企业招聘系统，不能仅登记 URL 就声称已经接通");
}

async function readJson(url, fetchImpl, body) {
  const response = await fetchImpl(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "omit",
    cache: "no-store",
    headers: body === undefined
      ? { Accept: "application/json, text/plain, */*" }
      : { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`公开招聘接口请求失败：HTTP ${response.status}`);
  return response.json();
}

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function decryptMoka(envelope, cryptoImpl = globalThis.crypto) {
  if (typeof envelope?.data !== "string" || typeof envelope?.necromancer !== "string" || new TextEncoder().encode(envelope.necromancer).length !== 16) {
    throw new Error("Moka 公共列表响应格式改变：缺少有效 data/necromancer");
  }
  const key = await cryptoImpl.subtle.importKey("raw", new TextEncoder().encode(envelope.necromancer), "AES-CBC", false, ["decrypt"]);
  const decrypted = await cryptoImpl.subtle.decrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode("de7c21ed8d6f50fe") },
    key,
    decodeBase64(envelope.data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function makeJob(source, board, id, title, url, location, description, publishedAt) {
  if ((typeof id !== "string" && typeof id !== "number") || !String(id) || !text(title).trim() || !text(url)) return null;
  return {
    id: `${board.provider}:${source.id}:${id}`,
    providerId: String(id),
    sourcePlatform: source.name,
    sourceName: source.name,
    sourceType: "official-career-site",
    sourceVerified: true,
    sourceUrl: canonicalUrl(text(url)),
    title: text(title).trim(),
    company: source.name,
    location,
    description: plainText(description),
    publishedAt: normalizeDate(publishedAt),
    metadata: { provider: board.provider, companyId: source.id },
  };
}

export async function searchCompanyJobs(source, { query, page = 1, pageSize = 100 }, fetchImpl = fetch) {
  const board = resolveBoard(source);
  const limit = Math.min(board.pageSize, Math.max(1, pageSize));
  const offset = (page - 1) * limit;
  const job = (...args) => makeJob(source, board, ...args);
  let data;
  let list;
  let total;
  let normalized;

  if (board.provider === "meituan") {
    data = await readJson(board.api, fetchImpl, {
      page: { pageNo: page, pageSize: limit }, keywords: query,
      jobShareType: "1", jobType: [{ code: "3", subCode: [] }], cityList: [], department: [], jfJgList: [], typeCode: [], specialCode: [],
    });
    list = data?.data?.list;
    total = Number(data?.data?.page?.totalCount);
    if (data?.success === false || !Array.isArray(list)) throw new Error("美团公开职位列表格式改变或接口报错");
    normalized = list.map((post) => job(
      post?.jobUnionId, post?.name,
      `${board.origin}/web/position/detail?jobUnionId=${encodeURIComponent(post?.jobUnionId ?? "")}`,
      names(post?.cityList), [post?.jobDuty, post?.jobRequirement].filter(Boolean).join("\n"),
      post?.refreshTime ?? post?.firstPostTime,
    ));
  } else if (board.provider === "feishu") {
    data = await readJson(board.api, fetchImpl, { limit, offset, keyword: query });
    list = data?.data?.job_post_list;
    total = Number(data?.data?.count);
    if (data?.code !== 0 || !Array.isArray(list)) throw new Error(`飞书招聘公开接口错误或格式改变：code=${data?.code}`);
    normalized = list.map((post) => job(
      post?.id, post?.title,
      `${board.origin}/${board.origin === "https://jobs.bytedance.com" ? "experienced" : "index"}/position/${encodeURIComponent(post?.id ?? "")}/detail`,
      names(post?.city_list), [post?.recruit_type?.name, post?.description, post?.requirement].filter(Boolean).join("\n"),
      post?.publish_time,
    ));
  } else if (board.provider === "moka") {
    const envelope = await readJson(board.api, fetchImpl, {
      siteId: board.siteId, orgId: board.slug, locale: "zh-CN", limit, offset, ...(query ? { keyword: query } : {}),
    });
    data = await decryptMoka(envelope);
    list = data?.data?.jobs;
    total = Number(data?.data?.total ?? data?.data?.count);
    if (data?.success === false || !Array.isArray(list)) throw new Error("Moka 公开职位列表格式改变或接口报错");
    normalized = list.map((post) => job(
      post?.id, post?.title, `${board.base}#/job/${encodeURIComponent(post?.id ?? "")}`,
      Array.isArray(post?.locations) ? post.locations.map((location) => [location?.provinceName, location?.cityName].filter(Boolean).join(" ")).join("/") : "",
      [post?.commitment, post?.jobDescription].filter(Boolean).join("\n"), post?.createdAt,
    ));
  } else {
    data = await readJson(board.api, fetchImpl);
    list = board.provider === "lever" ? data : data?.jobs;
    total = list?.length;
    if (!Array.isArray(list)) throw new Error(`${board.provider} 公开职位列表格式改变或接口报错`);
    if (board.provider === "greenhouse") {
      normalized = list.map((post) => job(post?.id, post?.title, post?.absolute_url, post?.location?.name ?? "", post?.content, post?.first_published));
    } else if (board.provider === "lever") {
      normalized = list.map((post) => job(
        post?.id, post?.text, post?.hostedUrl,
        [...new Set([post?.categories?.location, ...(post?.categories?.allLocations ?? [])].filter(Boolean))].join("/"),
        [post?.descriptionPlain, ...(post?.lists ?? []).map((item) => `${item?.text ?? ""} ${item?.content ?? ""}`), post?.additionalPlain].filter(Boolean).join("\n"),
        post?.createdAt,
      ));
    } else {
      normalized = list.filter((post) => post?.isListed !== false).map((post) => job(
        post?.id, post?.title, post?.jobUrl,
        [...new Set([post?.location, ...(post?.secondaryLocations ?? []).map((location) => location?.location), post?.isRemote ? "Remote" : null].filter(Boolean))].join("/"),
        post?.descriptionPlain, post?.publishedAt,
      ));
    }
  }

  const jobs = normalized.filter(Boolean);
  return { jobs, total: Number.isFinite(total) ? total : jobs.length, page };
}

export function createCompanyProvider(source, fetchImpl = fetch) {
  return {
    id: source.id,
    name: `${source.name}官网`,
    kind: "official-career-site",
    search: (input) => searchCompanyJobs(source, input, fetchImpl),
    detail: async (job) => job,
  };
}
