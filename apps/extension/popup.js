import { analyzeJob } from "./shared/matcher.js";
import { createApplicationRecord, markApplicationSubmitted, upsertApplication } from "./shared/applications.js";
import { buildAutofillPayload, SENSITIVE_LABELS } from "./shared/form-mapping.js";
import { extractJobFromPage, fillGenericForm } from "./shared/page-actions.js";
import { profileHasUsefulData } from "./shared/profile.js";
import { createResumeVariant } from "./shared/resume.js";
import { loadApplications, loadDraft, loadProfile, saveApplications, saveDraft } from "./shared/storage.js";

let profile;
let draft;
let applications;

const elements = Object.fromEntries([
  "onboarding", "start-panel", "result-panel", "resume-panel", "job-company", "job-title", "job-meta",
  "score", "decision", "strengths", "gaps", "resume-preview", "status",
].map((id) => [id, document.getElementById(id)]));

function showStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = kind;
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function fillList(element, items, emptyMessage) {
  element.replaceChildren();
  for (const item of items.length ? items : [emptyMessage]) {
    const li = document.createElement("li");
    li.textContent = item;
    element.append(li);
  }
}

function renderAssessment() {
  if (!draft?.assessment) return;
  const assessment = draft.assessment;
  const { job } = assessment;
  elements["start-panel"].classList.add("hidden");
  elements["result-panel"].classList.remove("hidden");
  elements["job-company"].textContent = job.company;
  elements["job-title"].textContent = job.title;
  elements["job-meta"].textContent = [job.location, job.sourcePlatform].filter(Boolean).join(" · ");
  elements.score.querySelector("strong").textContent = assessment.score;
  elements.score.style.setProperty("--score-angle", `${assessment.score * 3.6}deg`);
  elements.decision.textContent = assessment.hardRequirementsMet
    ? assessment.passedThreshold ? "达到你的匹配阈值，可以进一步核对。" : "硬条件未发现冲突，但匹配度低于你的阈值。"
    : "发现可能不满足的硬条件，请先人工核对。";
  elements.decision.classList.toggle("warn", !assessment.passedThreshold);
  fillList(elements.strengths, assessment.strengths, "暂未发现明确优势");
  fillList(elements.gaps, [...assessment.gaps, ...assessment.warnings], "暂未发现明显差距");
  if (draft.resumeVariant) {
    elements["resume-panel"].classList.remove("hidden");
    elements["resume-preview"].value = draft.resumeVariant.markdown;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("无法获取当前标签页");
  return tab;
}

async function analyzeCurrentPage() {
  showStatus("正在读取当前页面…");
  const tab = await activeTab();
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJobFromPage });
  const assessment = analyzeJob(result, profile);
  draft = await saveDraft({ assessment, resumeVariant: null, updatedAt: new Date().toISOString() });
  renderAssessment();
  showStatus("分析完成。请核对岗位名称、公司和硬条件。", "success");
}

async function generateResume() {
  if (!draft?.assessment) return;
  draft.resumeVariant = createResumeVariant(profile, draft.assessment);
  draft.updatedAt = new Date().toISOString();
  await saveDraft(draft);
  renderAssessment();
  showStatus("岗位版简历已生成；内容仅来自本地事实库。", "success");
}

async function downloadResume() {
  if (!draft?.resumeVariant) return;
  const blobUrl = URL.createObjectURL(new Blob([draft.resumeVariant.markdown], { type: "text/markdown" }));
  await chrome.downloads.download({
    url: blobUrl,
    filename: `AutumnApply-${draft.assessment.job.company}-${draft.assessment.job.title}.md`.replace(/[\\/:*?"<>|]/g, "-"),
    saveAs: true,
  });
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

async function fillCurrentForm() {
  const tab = await activeTab();
  const payload = { ...buildAutofillPayload(profile), sensitiveLabels: SENSITIVE_LABELS };
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillGenericForm,
    args: [payload],
  });
  const message = `已填写 ${result.filled.length} 项；跳过 ${result.skipped.length} 项；需人工处理 ${result.review.length} 项。`;
  showStatus(message, result.review.length ? "" : "success");
}

async function saveApplication(status = "prepared") {
  if (!draft?.assessment) throw new Error("请先分析岗位");
  const existing = applications.find((item) => item.jobId === draft.assessment.job.id);
  let record = existing
    ? { ...existing, score: draft.assessment.score, resumeVariantId: draft.resumeVariant?.id ?? existing.resumeVariantId, status }
    : createApplicationRecord(draft, status);
  if (status === "submitted") record = markApplicationSubmitted(record);
  applications = upsertApplication(applications, record);
  await saveApplications(applications);
  draft.applicationId = applications.find((item) => item.jobId === draft.assessment.job.id)?.id;
  await saveDraft(draft);
  showStatus(status === "submitted" ? "已标记为已投递。" : "已保存到本地投递台账。", "success");
}

document.querySelector("#open-options").addEventListener("click", openOptions);
document.querySelector("#setup-profile").addEventListener("click", openOptions);
document.querySelector("#analyze-job").addEventListener("click", () => analyzeCurrentPage().catch((error) => showStatus(`分析失败：${error.message}`, "error")));
document.querySelector("#reanalyze").addEventListener("click", () => analyzeCurrentPage().catch((error) => showStatus(`分析失败：${error.message}`, "error")));
document.querySelector("#generate-resume").addEventListener("click", () => generateResume().catch((error) => showStatus(`生成失败：${error.message}`, "error")));
document.querySelector("#fill-form").addEventListener("click", () => fillCurrentForm().catch((error) => showStatus(`填写失败：${error.message}`, "error")));
document.querySelector("#save-application").addEventListener("click", () => saveApplication().catch((error) => showStatus(`保存失败：${error.message}`, "error")));
document.querySelector("#mark-submitted").addEventListener("click", () => {
  if (!confirm("AutumnApply 不会代替你提交。请只在你已经检查网页并亲自完成提交后，标记为已投递。")) return;
  saveApplication("submitted").catch((error) => showStatus(`更新失败：${error.message}`, "error"));
});
document.querySelector("#copy-resume").addEventListener("click", async () => {
  await navigator.clipboard.writeText(draft.resumeVariant.markdown);
  showStatus("已复制 Markdown 简历。", "success");
});
document.querySelector("#download-resume").addEventListener("click", () => downloadResume().catch((error) => showStatus(`下载失败：${error.message}`, "error")));

profile = await loadProfile();
draft = await loadDraft();
applications = await loadApplications();
if (!profileHasUsefulData(profile)) {
  elements.onboarding.classList.remove("hidden");
  elements["start-panel"].classList.add("hidden");
} else if (draft?.assessment) {
  renderAssessment();
}
