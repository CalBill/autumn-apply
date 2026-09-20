import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchMonitor, updateMonitorAfterSearch } from "./search-monitor.js";

test("search monitor only accepts supported intervals", () => {
  assert.equal(normalizeSearchMonitor({ enabled: true, intervalHours: 3 }).intervalHours, 24);
  assert.equal(normalizeSearchMonitor({ enabled: true, intervalHours: 72 }).intervalHours, 72);
});

test("search monitor reports only unseen jobs", () => {
  const updated = updateMonitorAfterSearch({ enabled: true, seenJobIds: ["job-1"] }, [
    { job: { id: "job-1", title: "旧岗位" } }, { job: { id: "job-2", title: "新岗位" } },
  ]);
  assert.deepEqual(updated.newJobs.map((job) => job.id), ["job-2"]);
  assert.deepEqual(updated.seenJobIds, ["job-1", "job-2"]);
});
