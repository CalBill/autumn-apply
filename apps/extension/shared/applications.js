import { newId } from "./profile.js";

export const APPLICATION_STATUSES = [
  "discovered", "shortlisted", "preparing", "prepared", "submission_attempted", "submitted",
  "assessment", "interview", "offer", "rejected", "withdrawn",
];

export const STATUS_LABELS = {
  discovered: "已发现",
  shortlisted: "已筛选",
  preparing: "准备材料",
  prepared: "待提交",
  submission_attempted: "已发起提交",
  submitted: "已投递",
  assessment: "笔试 / 测评",
  interview: "面试",
  offer: "Offer",
  rejected: "未通过",
  withdrawn: "已放弃",
};

export function createApplicationRecord(draft, status = "prepared") {
  if (!draft?.assessment?.job) throw new Error("缺少岗位分析结果");
  const now = new Date().toISOString();
  return {
    id: newId("application"),
    jobId: draft.assessment.job.id,
    job: draft.assessment.job,
    score: draft.assessment.score,
    resumeVariantId: draft.resumeVariant?.id ?? null,
    assessment: draft.assessment,
    decision: status === "withdrawn" ? "skip" : ["preparing", "prepared", "submission_attempted", "submitted"].includes(status) ? "apply" : "pending",
    decisionReason: "",
    preparation: {
      questions: [],
      resumeVariant: draft.resumeVariant ?? null,
      notes: "",
    },
    submission: {
      mode: "review",
      authorizedAt: null,
      attemptedAt: null,
      confirmedAt: null,
    },
    status,
    submittedAt: status === "submitted" ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertApplication(records, record) {
  const index = records.findIndex((item) => item.id === record.id || item.jobId === record.jobId);
  const normalized = { ...record, updatedAt: new Date().toISOString() };
  if (index === -1) return [normalized, ...records];
  return records.map((item, itemIndex) => itemIndex === index ? { ...item, ...normalized, id: item.id } : item);
}

export function markApplicationSubmitted(record) {
  const now = new Date().toISOString();
  return {
    ...record,
    status: "submitted",
    submittedAt: record.submittedAt ?? now,
    submission: { ...record.submission, confirmedAt: record.submission?.confirmedAt ?? now },
    updatedAt: now,
  };
}

export function markApplicationDecision(record, decision, reason = "") {
  if (!["apply", "skip"].includes(decision)) throw new Error("未知的岗位决定");
  return {
    ...record,
    decision,
    decisionReason: String(reason ?? "").trim(),
    status: decision === "apply" ? "preparing" : "withdrawn",
    updatedAt: new Date().toISOString(),
  };
}

export function setSubmissionMode(record, mode) {
  if (!["review", "authorized_once"].includes(mode)) throw new Error("未知的提交模式");
  const now = new Date().toISOString();
  return {
    ...record,
    submission: {
      mode,
      authorizedAt: mode === "authorized_once" ? now : null,
      attemptedAt: record.submission?.attemptedAt ?? null,
      confirmedAt: record.submission?.confirmedAt ?? null,
    },
    updatedAt: now,
  };
}

export function recordSubmissionAttempt(record) {
  if (record.submission?.mode !== "authorized_once") throw new Error("当前岗位尚未授权自动提交");
  const now = new Date().toISOString();
  return {
    ...record,
    status: "submission_attempted",
    submission: { ...record.submission, attemptedAt: now, mode: "review", authorizedAt: null },
    updatedAt: now,
  };
}

function normalizedJobUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|from|ref|referer|channel|campaign)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return String(value ?? "").trim();
  }
}

function comparable(value) {
  return String(value ?? "").toLocaleLowerCase().replace(/[\s·|_-]/g, "");
}

export function findApplicationForJob(records, job) {
  const sourceUrl = normalizedJobUrl(job?.sourceUrl);
  const exact = records.find((item) => {
    if (item.jobId === job?.id) return true;
    const candidateUrl = normalizedJobUrl(item.job?.sourceUrl);
    return Boolean(sourceUrl && candidateUrl && sourceUrl === candidateUrl);
  });
  if (exact) return exact;
  return records.find((item) => {
    const sameTitle = comparable(item.job?.title) && comparable(item.job?.title) === comparable(job?.title);
    const sameCompany = comparable(item.job?.company) && comparable(item.job?.company) === comparable(job?.company);
    const locations = [comparable(item.job?.location), comparable(job?.location)];
    return sameTitle && sameCompany && (!locations[0] || !locations[1] || locations[0] === locations[1]);
  });
}
