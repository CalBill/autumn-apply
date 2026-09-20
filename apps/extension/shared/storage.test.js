import assert from "node:assert/strict";
import test from "node:test";

import {
  loadApplications, loadDiscovery, saveApplications, saveDiscovery, STORAGE_KEYS,
} from "./storage.js";

function installStorage(initial = {}) {
  const values = structuredClone(initial);
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return { [key]: values[key] }; },
        async set(entries) { Object.assign(values, structuredClone(entries)); },
        async remove(keys) { for (const key of keys) delete values[key]; },
      },
    },
  };
  return {
    values,
    restore() {
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
    },
  };
}

const job = {
  id: "job-1",
  title: "合规管培生",
  company: "测试公司",
  location: "上海",
  description: "面向2027届毕业生的校园招聘岗位。",
  sourceUrl: "https://example.com/jobs/1",
  sourcePlatform: "测试官网",
};

test("discovery storage removes runtime providers and duplicate assessment jobs", async () => {
  const storage = installStorage();
  try {
    const provider = { id: "runtime", name: "运行时来源", search() {}, detail() {} };
    const loaded = await saveDiscovery({
      instructions: {}, sourceStats: [], errors: [], searchedAt: "2026-09-20T00:00:00.000Z",
      results: [{ job: { ...job, provider }, assessment: { job, score: 88 } }],
    });
    const stored = storage.values[STORAGE_KEYS.discovery];

    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.results[0].job.provider, undefined);
    assert.equal(stored.results[0].assessment.job, undefined);
    assert.equal(stored.results[0].assessment.jobId, job.id);
    assert.equal(loaded.results[0].assessment.job, loaded.results[0].job);
    assert.doesNotThrow(() => structuredClone(stored));
  } finally {
    storage.restore();
  }
});

test("application storage compacts records and hydrates legacy arrays", async () => {
  const legacy = [{ id: "application-1", jobId: job.id, job, assessment: { job, score: 75 } }];
  const storage = installStorage({ [STORAGE_KEYS.applications]: legacy });
  try {
    const loadedLegacy = await loadApplications();
    assert.equal(loadedLegacy[0].assessment.job, loadedLegacy[0].job);

    await saveApplications(loadedLegacy);
    const stored = storage.values[STORAGE_KEYS.applications];
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.records[0].assessment.job, undefined);

    const reloaded = await loadApplications();
    assert.equal(reloaded[0].assessment.job, reloaded[0].job);
    assert.equal(reloaded[0].assessment.score, 75);
  } finally {
    storage.restore();
  }
});

test("legacy discovery records are hydrated without losing their job", async () => {
  const storage = installStorage({
    [STORAGE_KEYS.discovery]: { results: [{ job, assessment: { score: 80 } }] },
  });
  try {
    const loaded = await loadDiscovery();
    assert.equal(loaded.results[0].assessment.job, loaded.results[0].job);
    assert.equal(loaded.results[0].job.title, job.title);
  } finally {
    storage.restore();
  }
});
