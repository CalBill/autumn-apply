export const SEARCH_ALARM_NAME = "autumn-apply-job-monitor";

export function normalizeSearchMonitor(input = {}) {
  const intervalHours = [12, 24, 72].includes(Number(input.intervalHours)) ? Number(input.intervalHours) : 24;
  return {
    enabled: input.enabled === true,
    intervalHours,
    instructions: input.instructions && typeof input.instructions === "object" ? input.instructions : null,
    seenJobIds: Array.isArray(input.seenJobIds) ? [...new Set(input.seenJobIds.map(String))].slice(-2_000) : [],
    lastRunAt: input.lastRunAt ? String(input.lastRunAt) : null,
    lastError: input.lastError ? String(input.lastError).slice(0, 500) : "",
  };
}

export function updateMonitorAfterSearch(monitor, results, { error = "", searchedAt = new Date().toISOString() } = {}) {
  const normalized = normalizeSearchMonitor(monitor);
  if (error) return { ...normalized, lastRunAt: searchedAt, lastError: String(error).slice(0, 500), newJobs: [] };
  const known = new Set(normalized.seenJobIds);
  const jobs = (results ?? []).map((entry) => entry.job ?? entry).filter((job) => job?.id);
  const newJobs = jobs.filter((job) => !known.has(String(job.id)));
  return {
    ...normalized,
    seenJobIds: [...new Set([...normalized.seenJobIds, ...jobs.map((job) => String(job.id))])].slice(-2_000),
    lastRunAt: searchedAt,
    lastError: "",
    newJobs,
  };
}
