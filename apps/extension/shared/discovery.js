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

function passesSummaryFilter(job, instructions) {
  const text = `${job.title} ${job.company} ${job.location}`;
  // Unknown locations remain visible with a warning instead of being silently
  // discarded. Recruitment announcements often omit the city in the excerpt.
  if (instructions.locations.length && job.location && !containsAny(job.location, instructions.locations)) return false;
  if (instructions.excludedKeywords.length && containsAny(text, instructions.excludedKeywords)) return false;
  if (job.publishedAt) {
    const published = Date.parse(`${job.publishedAt}T00:00:00+08:00`);
    if (Number.isFinite(published) && Date.now() - published > instructions.recentDays * 86_400_000) return false;
  }
  return true;
}

function passesDetailFilter(job, instructions) {
  const text = `${job.title} ${job.company} ${job.location} ${job.description}`;
  if (instructions.campusOnly && !containsAny(text, ["校招", "校园招聘", "应届", "毕业生", "届", "管培生"])) return false;
  if (instructions.requiredKeywords.length && !instructions.requiredKeywords.every((keyword) => containsAny(text, [keyword]))) return false;
  if (instructions.excludedKeywords.length && containsAny(text, instructions.excludedKeywords)) return false;
  return true;
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

  const candidateLimit = Math.min(40, Math.max(instructions.maxResults * 2, 15));
  const deduplicated = selectFairCandidates(
    [...new Map(summaries.map((job) => [job.id, job])).values()]
      .filter((job) => passesSummaryFilter(job, instructions)),
    candidateLimit,
  );

  onProgress(`正在读取 ${deduplicated.length} 个岗位的任职要求…`);
  const detailed = await mapWithConcurrency(deduplicated, 4, async (job) => {
    try {
      return await job.provider.detail(job);
    } catch (error) {
      errors.push(`${job.provider.name} · ${job.title}：${error.message}`);
      return null;
    }
  });

  const results = detailed
    .filter(Boolean)
    .filter((job) => passesDetailFilter(job, instructions))
    .map((job) => ({ job, assessment: analyzeJob(job, profile) }))
    .filter(({ job, assessment }) => {
      if (job.sourceType !== "wechat-article") return assessment.score >= instructions.minimumScore;
      const quality = Number(job.metadata?.qualityScore) || 0;
      return quality >= 55 && assessment.score >= Math.min(50, instructions.minimumScore);
    })
    .sort((a, b) => b.assessment.score - a.assessment.score)
    .slice(0, instructions.maxResults);

  return {
    instructions,
    results,
    sourceStats,
    errors,
    searchedAt: new Date().toISOString(),
  };
}
