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
    requiredKeywords: splitList(input.requiredKeywords),
    excludedKeywords: splitList(input.excludedKeywords),
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
  if (instructions.locations.length && !containsAny(job.location, instructions.locations)) return false;
  if (instructions.excludedKeywords.length && containsAny(text, instructions.excludedKeywords)) return false;
  if (job.publishedAt) {
    const published = Date.parse(`${job.publishedAt}T00:00:00+08:00`);
    if (Number.isFinite(published) && Date.now() - published > instructions.recentDays * 86_400_000) return false;
  }
  return true;
}

function passesDetailFilter(job, instructions) {
  const text = `${job.title} ${job.company} ${job.location} ${job.description}`;
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

export async function discoverJobs({ profile, instructions: rawInstructions, providers, onProgress = () => {} }) {
  const instructions = normalizeDiscoveryInstructions(rawInstructions, profile);
  if (!instructions.queries.length) throw new Error("请至少提供一个目标岗位或搜索关键词");
  const summaries = [];
  const sourceStats = [];
  const errors = [];

  for (const provider of providers) {
    let fetched = 0;
    for (const query of instructions.queries) {
      onProgress(`正在从${provider.name}搜索“${query}”…`);
      try {
        const output = await provider.search({ query, page: 1, pageSize: 100 });
        fetched += output.jobs.length;
        summaries.push(...output.jobs.map((job) => ({ ...job, provider })));
      } catch (error) {
        errors.push(`${provider.name} · ${query}：${error.message}`);
      }
    }
    sourceStats.push({ id: provider.id, name: provider.name, fetched });
  }

  const deduplicated = [...new Map(summaries.map((job) => [job.id, job])).values()]
    .filter((job) => passesSummaryFilter(job, instructions))
    .slice(0, Math.min(40, Math.max(instructions.maxResults * 2, 15)));

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
    .filter(({ assessment }) => assessment.score >= instructions.minimumScore)
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
