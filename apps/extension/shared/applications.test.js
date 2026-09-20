import assert from "node:assert/strict";
import test from "node:test";

import {
  createApplicationRecord, findApplicationForJob, markApplicationDecision, markApplicationSubmitted,
  recordSubmissionAttempt, setSubmissionMode, upsertApplication,
} from "./applications.js";
import { createPreparationQuestions, preparationReadiness } from "./application-workflow.js";

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

test("application decisions and one-time submission authorization are explicit", () => {
  let record = markApplicationDecision(createApplicationRecord(draft, "shortlisted"), "apply");
  assert.equal(record.status, "preparing");
  assert.throws(() => recordSubmissionAttempt(record), /尚未授权/);
  record = setSubmissionMode(record, "authorized_once");
  record = recordSubmissionAttempt(record);
  assert.equal(record.status, "submission_attempted");
  assert.equal(record.submission.mode, "review");
  assert.ok(record.submission.attemptedAt);
});

test("applications can be matched to a job by normalized source URL", () => {
  const record = createApplicationRecord({
    assessment: { job: { id: "old", sourceUrl: "https://example.com/job/1?from=list" }, score: 70 },
  });
  assert.equal(findApplicationForJob([record], { id: "new", sourceUrl: "https://example.com/job/1#apply" }), record);
});

test("preparation questions expose missing evidence before a job is ready", () => {
  const assessment = {
    job: { id: "job-2", title: "合规岗", description: "要求英语六级，并优先考虑中共党员" },
    missingSkills: ["风险分析"],
  };
  const profile = { qualifications: { politicalStatus: "", certificates: [], languages: [] }, experiences: [], projects: [] };
  const questions = createPreparationQuestions(profile, assessment);
  const record = createApplicationRecord({ assessment: { ...assessment, score: 60 } }, "preparing");
  record.preparation.questions = questions;
  assert.ok(questions.some((item) => item.subject === "政治面貌"));
  assert.equal(preparationReadiness(record).ready, false);
});
