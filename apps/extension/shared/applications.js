import { newId } from "./profile.js";

export const APPLICATION_STATUSES = [
  "discovered", "shortlisted", "prepared", "submitted", "assessment", "interview", "offer", "rejected", "withdrawn",
];

export const STATUS_LABELS = {
  discovered: "已发现",
  shortlisted: "已筛选",
  prepared: "待提交",
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
  return { ...record, status: "submitted", submittedAt: record.submittedAt ?? now, updatedAt: now };
}
