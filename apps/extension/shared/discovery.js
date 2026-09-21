import { analyzeJob } from "./matcher.js";
import { splitList } from "./profile.js";

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeDiscoveryInstructions(input = {}, profile) {
  const explicitQueries = splitList(input.queries);
  const queries = unique([...explicitQueries, ...profile.preferences.roles]).slice(0, 3);
  return {
    queries,
    locations: splitList(input.locations).length ? splitList(input.locations) : profile.preferences.locations,
    industries: profile.preferences.industries ?? [],
    companyTypes: profile.preferences.companyTypes ?? [],
    wechatKeywords: splitList(input.wechatKeywords),
    campusOnly: profile.preferences.campusOnly !== false,
    requiredKeywords: splitList(input.requiredKeywords).length
      ? splitList(input.requiredKeywords)
      : profile.preferences.requiredKeywords ?? [],
    excludedKeywords: splitList(input.excludedKeywords).length
      ? splitList(input.excludedKeywords)
      : profile.preferences.excludedKeywords ?? [],
    minimumScore: Math.min(100, Math.max(0, Number(input.minimumScore) || profile.preferences.minimumScore || 60)),
    maxResults: Math.min(30, Math.max(1, Number(input.maxResults) || 15)),
    recentDays: Math.min(365, Math.max(1, Number(input.recentDays) || 90)),
  };
}

function containsAny(text, values) {
  const normalized = normalize(text);
  return values.some((value) => normalized.includes(normalize(value)));
}

const CAMPUS_SIGNALS = ["校招", "校园招聘", "应届", "毕业生", "届", "管培生"];

function candidateText(job) {
  return `${job.title} ${job.company} ${job.location} ${job.description}`;
}

function isOlderThanRequestedWindow(job, recentDays) {
  if (!job.publishedAt) return false;
  const published = Date.parse(`${job.publishedAt}T00:00:00+08:00`);
  return Number.isFinite(published) && Date.now() - published > recentDays * 86_400_000;
}

function classifyCandidate(job, assessment, instructions) {
  const text = candidateText(job);
  const reasons = [];
  const excludedBy = instructions.excludedKeywords.filter((keyword) => containsAny(text, [keyword]));
  if (excludedBy.length) return { tier: "excluded", reasons: [`命中排除条件：${excludedBy.join("、")}`] };
  if (!assessment.hardRequirementsMet) {
    return { tier: "not-recommended", reasons: ["已识别到不满足的硬性条件", ...assessment.gaps.slice(0, 2)] };
  }

  const locationMismatch = instructions.locations.length && job.location
    && !containsAny(job.location, instructions.locations);
  const campusSignal = containsAny(text, CAMPUS_SIGNALS);
  const missingRequired = instructions.requiredKeywords.filter((keyword) => !containsAny(text, [keyword]));
  const sparseDescription = job.description.length < 80;
  const oldPosting = isOlderThanRequestedWindow(job, instructions.recentDays);

  if (locationMismatch) reasons.push(`地点“${job.location}”不在目标城市中`);
  if (instructions.campusOnly && !campusSignal) reasons.push("摘要未能确认校招/应届条件");
  if (missingRequired.length) reasons.push(`摘要未确认必备条件：${missingRequired.join("、")}`);
  if (oldPosting) reasons.push(`发布时间可能早于最近 ${instructions.recentDays} 天`);
  if (sparseDescription) reasons.push("岗位详情较短，建议打开原始页面核验");

  if (assessment.hardRequirementsMet
    && assessment.score >= instructions.minimumScore
    && !locationMismatch
    && (!instructions.campusOnly || campusSignal)
    && missingRequired.length === 0
    && !oldPosting) {
    return { tier: "recommended", reasons: ["与当前偏好和已识别要求匹配"] };
  }
  if (sparseDescription || (instructions.campusOnly && !campusSignal) || missingRequired.length || oldPosting) {
    return { tier: "review", reasons };
  }
  return { tier: "potential", reasons: reasons.length ? reasons : ["与目标方向存在部分匹配，建议人工判断"] };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function selectFairCandidates(jobs, limit) {
  const groups = new Map();
  for (const job of jobs) {
    const providerId = job.provider?.id ?? "unknown";
    if (!groups.has(providerId)) groups.set(providerId, []);
    groups.get(providerId).push(job);
  }
  const queues = [...groups.values()];
  const selected = [];
  for (let index = 0; selected.length < limit; index += 1) {
    let added = false;
    for (const queue of queues) {
      if (queue[index]) {
        selected.push(queue[index]);
        added = true;
        if (selected.length === limit) break;
      }
    }
    if (!added) break;
  }
  return selected;
}

export async function discoverJobs({ profile, instructions: rawInstructions, providers, onProgress = () => {} }) {
  const instructions = normalizeDiscoveryInstructions(rawInstructions, profile);
  if (!instructions.queries.length) throw new Error("请至少提供一个目标岗位或搜索关键词");
  const summaries = [];
  const sourceStats = [];
  const errors = [];

  const regularProviders = providers.filter((provider) => !provider.batchSearch);
  const regularTasks = regularProviders.flatMap((provider) => instructions.queries.map((query) => ({ provider, query })));
  const regularOutputs = await mapWithConcurrency(regularTasks, 4, async ({ provider, query }) => {
    onProgress(`正在从${provider.name}搜索“${query}”…`);
    try {
      const output = await provider.search({
        query,
        graduationYear: profile.preferences.graduationYear,
        recentDays: instructions.recentDays,
        page: 1,
        pageSize: 100,
      });
      return { provider, query, output };
    } catch (error) {
      return { provider, query, error };
    }
  });
  for (const provider of regularProviders) {
    const outputs = regularOutputs.filter((item) => item.provider === provider);
    let fetched = 0;
    for (const { query, output, error } of outputs) {
      if (error) {
        errors.push(`${provider.name} · ${query}：${error.message}`);
        continue;
      }
      fetched += output.jobs.length;
      summaries.push(...output.jobs.map((job) => ({ ...job, provider })));
    }
    sourceStats.push({ id: provider.id, name: provider.name, fetched });
  }

  for (const provider of providers.filter((item) => item.batchSearch)) {
    let fetched = 0;
    onProgress(`正在从${provider.name}进行多角度搜索…`);
    try {
      const output = await provider.search({
        queries: instructions.queries,
        locations: instructions.locations,
        industries: instructions.industries,
        companyTypes: instructions.companyTypes,
        focusKeywords: instructions.wechatKeywords,
        graduationYear: profile.preferences.graduationYear,
        recentDays: instructions.recentDays,
        page: 1,
        pageSize: 60,
      });
      fetched += output.jobs.length;
      summaries.push(...output.jobs.map((job) => ({ ...job, provider })));
      errors.push(...(output.warnings ?? []).map((warning) => `${provider.name}：${warning}`));
      sourceStats.push({
        id: provider.id,
        name: provider.name,
        fetched,
        searchedQueries: output.searchedQueries?.length ?? 0,
        plannedQueries: output.searchPlan?.length ?? 0,
      });
    } catch (error) {
      errors.push(`${provider.name}：${error.message}`);
      sourceStats.push({ id: provider.id, name: provider.name, fetched });
    }
  }

  // Discovery must build a broad opportunity pool before ranking.  A strict
  // match score is a recommendation signal, never a reason to erase every
  // result the user could otherwise inspect.
  const candidateLimit = Math.min(100, Math.max(instructions.maxResults * 4, 40));
  const deduplicated = selectFairCandidates(
    [...new Map(summaries.map((job) => [job.id, job])).values()],
    candidateLimit,
  );

  onProgress(`正在读取 ${deduplicated.length} 个岗位的任职要求…`);
  const detailed = await mapWithConcurrency(deduplicated, 4, async (job) => {
    try {
      return await job.provider.detail(job);
    } catch (error) {
      errors.push(`${job.provider.name} · ${job.title}：${error.message}`);
      // A detail endpoint failure should not make a discoverable opportunity
      // disappear. Keep its list-page excerpt and make the uncertainty clear.
      return {
        ...job,
        metadata: { ...(job.metadata ?? {}), detailUnavailable: true },
      };
    }
  });

  const tiers = { recommended: 0, potential: 0, review: 0, "not-recommended": 0, excluded: 0 };
  const candidates = detailed.filter(Boolean).map((job) => {
    const assessment = analyzeJob(job, profile);
    const classification = classifyCandidate(job, assessment, instructions);
    tiers[classification.tier] += 1;
    return { job, assessment, ...classification };
  });
  const tierOrder = { recommended: 0, potential: 1, review: 2, "not-recommended": 3, excluded: 4 };
  const results = candidates
    .filter((entry) => entry.tier !== "excluded")
    .sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]
      || b.assessment.score - a.assessment.score
      || String(b.job.publishedAt ?? "").localeCompare(String(a.job.publishedAt ?? "")))
    .slice(0, instructions.maxResults);

  return {
    instructions,
    results,
    sourceStats,
    errors,
    coverage: {
      fetched: summaries.length,
      considered: deduplicated.length,
      displayed: results.length,
      ...tiers,
    },
    searchedAt: new Date().toISOString(),
  };
}
