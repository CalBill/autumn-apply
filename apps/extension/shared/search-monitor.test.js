import assert from "node:assert/strict";
import test from "node:test";
import { findUpcomingDeadlines, normalizeSearchMonitor, updateMonitorAfterSearch } from "./search-monitor.js";

test("search monitor only accepts supported intervals", () => {
  assert.deepEqual(normalizeSearchMonitor(null), {
    enabled: false,
    intervalHours: 24,
    instructions: null,
    seenJobIds: [],
    deadlineNotifiedJobIds: [],
    lastRunAt: null,
    lastError: "",
  });
  assert.equal(normalizeSearchMonitor({ enabled: true, intervalHours: 3 }).intervalHours, 24);
  assert.equal(normalizeSearchMonitor({ enabled: true, intervalHours: 72 }).intervalHours, 72);
});

test("deadline reminders only include unnotified jobs due within seven days", () => {
  const now = Date.parse("2026-09-20T00:00:00+08:00");
  const jobs = [
    { id: "soon", deadline: "2026-09-25" },
    { id: "later", deadline: "2026-10-20" },
    { id: "done", deadline: "2026-09-21" },
  ];
  const due = findUpcomingDeadlines(jobs, { deadlineNotifiedJobIds: ["done"] }, { now });
  assert.deepEqual(due.map((job) => job.id), ["soon"]);
});

test("search monitor reports only unseen jobs", () => {
  const updated = updateMonitorAfterSearch({ enabled: true, seenJobIds: ["job-1"] }, [
    { job: { id: "job-1", title: "旧岗位" } }, { job: { id: "job-2", title: "新岗位" } },
  ]);
  assert.deepEqual(updated.newJobs.map((job) => job.id), ["job-2"]);
  assert.deepEqual(updated.seenJobIds, ["job-1", "job-2"]);
});
