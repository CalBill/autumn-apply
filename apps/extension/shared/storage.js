import { createEmptyProfile, normalizeProfile } from "./profile.js";
import { normalizeJob } from "./job.js";

const STORAGE_SCHEMA_VERSION = 2;

export const STORAGE_KEYS = {
  profile: "candidateProfile",
  applications: "applications",
  draft: "currentDraft",
  discovery: "lastDiscovery",
  companySources: "companySources",
  searchMonitor: "searchMonitor",
  wechatImportedArticles: "wechatImportedArticles",
};

function storageArea() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error("Chrome local storage is unavailable");
  }
  return globalThis.chrome.storage.local;
}

export async function loadProfile() {
  const result = await storageArea().get(STORAGE_KEYS.profile);
  return result[STORAGE_KEYS.profile]
    ? normalizeProfile(result[STORAGE_KEYS.profile])
    : createEmptyProfile();
}

export async function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  await storageArea().set({ [STORAGE_KEYS.profile]: normalized });
  return normalized;
}

export async function clearLocalData() {
  await storageArea().remove(Object.values(STORAGE_KEYS));
}

export async function loadDraft() {
  const result = await storageArea().get(STORAGE_KEYS.draft);
  return result[STORAGE_KEYS.draft] ?? null;
}

export async function saveDraft(draft) {
  await storageArea().set({ [STORAGE_KEYS.draft]: draft });
  return draft;
}

export async function loadApplications() {
  const result = await storageArea().get(STORAGE_KEYS.applications);
  const stored = result[STORAGE_KEYS.applications];
  const records = Array.isArray(stored) ? stored : stored?.records;
  return Array.isArray(records) ? records.map(hydrateApplication) : [];
}

export async function saveApplications(applications) {
  const records = applications.map(serializeApplication);
  await storageArea().set({
    [STORAGE_KEYS.applications]: { schemaVersion: STORAGE_SCHEMA_VERSION, records },
  });
  return records.map(hydrateApplication);
}

export async function loadDiscovery() {
  const result = await storageArea().get(STORAGE_KEYS.discovery);
  return hydrateDiscovery(result[STORAGE_KEYS.discovery]);
}

export async function saveDiscovery(discovery) {
  const stored = serializeDiscovery(discovery);
  await storageArea().set({ [STORAGE_KEYS.discovery]: stored });
  return hydrateDiscovery(stored);
}

function serializeAssessment(assessment, job) {
  if (!assessment || typeof assessment !== "object") return assessment ?? null;
  const { job: _duplicateJob, ...rest } = assessment;
  return { ...rest, jobId: assessment.jobId ?? job.id };
}

function hydrateAssessment(assessment, job) {
  return assessment && typeof assessment === "object" ? { ...assessment, job } : assessment ?? null;
}

function serializeApplication(record = {}) {
  const job = normalizeJob(record.job ?? record.assessment?.job);
  return { ...record, job, assessment: serializeAssessment(record.assessment, job) };
}

function hydrateApplication(record = {}) {
  const job = normalizeJob(record.job ?? record.assessment?.job);
  return { ...record, job, assessment: hydrateAssessment(record.assessment, job) };
}

function serializeDiscovery(discovery) {
  if (!discovery || typeof discovery !== "object") return null;
  return {
    ...discovery,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    results: (discovery.results ?? []).map((entry) => {
      const job = normalizeJob(entry.job ?? entry.assessment?.job);
      return { ...entry, job, assessment: serializeAssessment(entry.assessment, job) };
    }),
  };
}

function hydrateDiscovery(discovery) {
  if (!discovery || typeof discovery !== "object") return null;
  return {
    ...discovery,
    results: (discovery.results ?? []).map((entry) => {
      const job = normalizeJob(entry.job ?? entry.assessment?.job);
      return { ...entry, job, assessment: hydrateAssessment(entry.assessment, job) };
    }),
  };
}

export async function loadCompanySources() {
  const result = await storageArea().get(STORAGE_KEYS.companySources);
  return Array.isArray(result[STORAGE_KEYS.companySources]) ? result[STORAGE_KEYS.companySources] : [];
}

export async function saveCompanySources(sources) {
  const normalized = Array.isArray(sources)
    ? sources.map(({ id, name, url }) => ({ id: String(id), name: String(name), url: String(url), enabled: true }))
    : [];
  await storageArea().set({ [STORAGE_KEYS.companySources]: normalized });
  return normalized;
}

export async function loadWechatImportedArticles() {
  const result = await storageArea().get(STORAGE_KEYS.wechatImportedArticles);
  const stored = result[STORAGE_KEYS.wechatImportedArticles];
  return Array.isArray(stored) ? stored.map(normalizeJob) : [];
}

export async function saveWechatImportedArticles(articles) {
  const normalized = Array.isArray(articles)
    ? [...new Map(articles.map((article) => {
      const job = normalizeJob(article);
      return [job.id, job];
    })).values()].slice(-300)
    : [];
  await storageArea().set({ [STORAGE_KEYS.wechatImportedArticles]: normalized });
  return normalized;
}

export async function loadSearchMonitor() {
  const result = await storageArea().get(STORAGE_KEYS.searchMonitor);
  return result[STORAGE_KEYS.searchMonitor] ?? null;
}

export async function saveSearchMonitor(monitor) {
  await storageArea().set({ [STORAGE_KEYS.searchMonitor]: monitor });
  return monitor;
}
