import assert from "node:assert/strict";
import test from "node:test";

import { createApplicationRecord, markApplicationSubmitted, upsertApplication } from "./applications.js";

const draft = {
  assessment: { job: { id: "job-1", title: "数据分析", company: "示例公司" }, score: 82 },
  resumeVariant: { id: "resume-1" },
};

test("application records are deduplicated by job", () => {
  const first = createApplicationRecord(draft);
  const updated = { ...createApplicationRecord(draft), status: "shortlisted" };
  const records = upsertApplication(upsertApplication([], first), updated);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, first.id);
  assert.equal(records[0].status, "shortlisted");
});

test("submitted status is only added by an explicit transition", () => {
  const record = createApplicationRecord(draft);
  assert.equal(record.submittedAt, null);
  const submitted = markApplicationSubmitted(record);
  assert.equal(submitted.status, "submitted");
  assert.ok(submitted.submittedAt);
});
