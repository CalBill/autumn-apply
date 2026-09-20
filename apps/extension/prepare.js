import { STATUS_LABELS, setSubmissionMode, upsertApplication } from "./shared/applications.js";
import { createPreparationQuestions, mergePreparationQuestions, preparationReadiness, questionsFromAiPackage } from "./shared/application-workflow.js";
import { createApplicationPackageWithAi, exportResumeDocx } from "./shared/local-api.js";
import { createAiResumeVariant, createResumeVariant } from "./shared/resume.js";
import { loadApplications, loadProfile, saveApplications } from "./shared/storage.js";

const statusElement = document.querySelector("#page-status");
const questionList = document.querySelector("#question-list");
const questionEmpty = document.querySelector("#question-empty");
const resumeEditor = document.querySelector("#resume-editor");
let profile = await loadProfile();
let applications = await loadApplications();
const applicationId = new URLSearchParams(location.search).get("id");
let application = applications.find((item) => item.id === applicationId);

function showStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.className = kind;
}

function currentQuestions() {
  return [...questionList.querySelectorAll("[data-question]")].map((card) => ({
    id: card.dataset.id,
    category: card.dataset.category,
    subject: card.dataset.subject,
    prompt: card.querySelector(".question-prompt").textContent,
    reason: card.querySelector(".question-reason").textContent,
    answer: card.querySelector("textarea").value.trim(),
    confirmed: card.querySelector("input[type='checkbox']").checked,
  }));
}

function renderQuestions() {
  questionList.replaceChildren();
  const questions = application.preparation?.questions ?? [];
  questionEmpty.classList.toggle("hidden", questions.length > 0);
  for (const question of questions) {
    const card = document.querySelector("#question-template").content.firstElementChild.cloneNode(true);
    card.dataset.id = question.id;
    card.dataset.category = question.category;
    card.dataset.subject = question.subject;
    card.querySelector(".question-subject").textContent = question.subject;
    card.querySelector(".question-prompt").textContent = question.prompt;
    card.querySelector(".question-reason").textContent = question.reason;
    card.querySelector("textarea").value = question.answer ?? "";
    card.querySelector("input[type='checkbox']").checked = question.confirmed === true;
    questionList.append(card);
  }
  const remaining = questions.filter((item) => !item.confirmed || !item.answer).length;
  document.querySelector("#question-summary").textContent = questions.length ? `${remaining} 项待确认` : "资料暂时完整";
}

function renderAiMaterial() {
  const aiPackage = application.preparation?.aiPackage;
  const summary = document.querySelector("#ai-summary");
  const openAnswers = document.querySelector("#open-answers");
  summary.classList.toggle("hidden", !aiPackage);
  summary.textContent = aiPackage ? `AI材料说明：${aiPackage.summary}${aiPackage.warnings?.length ? ` 提醒：${aiPackage.warnings.join("；")}` : ""}` : "";
  openAnswers.replaceChildren();
  const drafts = aiPackage?.openQuestionDrafts ?? [];
  openAnswers.classList.toggle("hidden", drafts.length === 0);
  if (drafts.length) {
    const title = document.createElement("strong");
    title.textContent = "开放题草稿（必须核对事实）";
    openAnswers.append(title);
    for (const draft of drafts) {
      const item = document.createElement("div");
      item.className = "open-answer";
      const heading = document.createElement("strong");
      heading.textContent = draft.question;
      const answer = document.createElement("p");
      answer.textContent = draft.answer;
      item.append(heading, answer);
      openAnswers.append(item);
    }
  }
}

function renderReadiness() {
  const readiness = preparationReadiness(application);
  const element = document.querySelector("#readiness");
  element.textContent = readiness.ready ? "材料已具备，可以进入填写" : readiness.blockers.join("；");
  element.style.color = readiness.ready ? "var(--green)" : "var(--danger)";
  document.querySelector("#status-pill").textContent = STATUS_LABELS[application.status] ?? application.status;
}

function render() {
  const assessment = application.assessment ?? { job: application.job, score: application.score, strengths: [], gaps: [], warnings: [], matchedSkills: [], missingSkills: [] };
  document.querySelector("#job-title").textContent = `${application.job.company} · ${application.job.title}`;
  document.querySelector("#job-meta").textContent = [application.job.location, application.job.sourcePlatform].filter(Boolean).join(" · ");
  document.querySelector("#score").textContent = `${application.score ?? "—"} 分匹配`;
  document.querySelector("#decision-summary").textContent = [...(assessment.strengths ?? []).slice(0, 2), ...(assessment.gaps ?? []).slice(0, 1)].join("；") || "请核对岗位详情和申请材料。";
  const source = document.querySelector("#source-link");
  source.href = application.job.sourceUrl;
  source.textContent = application.job.sourceType === "wechat-article" ? "查看招聘线索" : "查看原始岗位";
  resumeEditor.value = application.preparation?.resumeVariant?.markdown ?? "";
  document.querySelector(`input[name='submissionMode'][value='${application.submission?.mode ?? "review"}']`).checked = true;
  renderQuestions();
  renderAiMaterial();
  renderReadiness();
}

async function persist({ announce = true } = {}) {
  const previousVariant = application.preparation?.resumeVariant;
  const markdown = resumeEditor.value.trim();
  application.preparation = {
    ...application.preparation,
    questions: currentQuestions(),
    resumeVariant: markdown ? { ...(previousVariant ?? {}), id: previousVariant?.id ?? `resume-manual-${Date.now()}`, markdown, updatedAt: new Date().toISOString() } : null,
  };
  const readiness = preparationReadiness(application);
  application.status = readiness.ready ? "prepared" : "preparing";
  application.updatedAt = new Date().toISOString();
  applications = upsertApplication(applications, application);
  await saveApplications(applications);
  renderReadiness();
  if (announce) showStatus("当前岗位的补充信息、简历和提交权限已保存在本机。", "success");
}

if (!application) {
  document.querySelector("main").innerHTML = '<section class="panel"><h2>没有找到这条申请</h2><p>请返回岗位列表重新选择“要投”。</p></section>';
  throw new Error("Application not found");
}

const assessment = application.assessment ?? { job: application.job, score: application.score, strengths: [], gaps: [], warnings: [], matchedSkills: [], missingSkills: [] };
application.preparation ??= { questions: [], resumeVariant: null, notes: "" };
application.preparation.questions = mergePreparationQuestions(
  application.preparation.questions,
  createPreparationQuestions(profile, assessment),
);
application.submission ??= { mode: "review", authorizedAt: null, attemptedAt: null, confirmedAt: null };
render();

document.querySelector("#save-questions").addEventListener("click", () => persist().then(renderQuestions).catch((error) => showStatus(error.message, "error")));
document.querySelector("#save-application").addEventListener("click", () => persist().catch((error) => showStatus(error.message, "error")));
document.querySelector("#generate-local").addEventListener("click", async () => {
  application.preparation.questions = currentQuestions();
  application.preparation.resumeVariant = createResumeVariant(profile, assessment);
  application.preparation.aiPackage = null;
  resumeEditor.value = application.preparation.resumeVariant.markdown;
  renderAiMaterial();
  await persist();
  showStatus("基础岗位版简历已生成：只调整已有经历的展示顺序，没有调用 AI。", "success");
});
document.querySelector("#generate-ai").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    application.preparation.questions = currentQuestions();
    showStatus("正在生成带来源证据的岗位材料；不会发送姓名、邮箱或手机号…");
    const result = await createApplicationPackageWithAi(profile, application.job, application.preparation.questions);
    application.preparation.aiPackage = result.package;
    application.preparation.questions = mergePreparationQuestions(application.preparation.questions, [
      ...createPreparationQuestions(profile, assessment),
      ...questionsFromAiPackage(application.job.id, result.package),
    ]);
    application.preparation.resumeVariant = createAiResumeVariant(profile, assessment, result.package);
    resumeEditor.value = application.preparation.resumeVariant.markdown;
    renderQuestions();
    renderAiMaterial();
    await persist({ announce: false });
    showStatus("AI岗位材料已生成。所有改写均标记为待用户核对，尚未提交给招聘网站。", "success");
  } catch (error) {
    showStatus(`AI生成失败：${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#download-resume").addEventListener("click", async () => {
  if (!resumeEditor.value.trim()) return showStatus("请先生成岗位版简历。", "error");
  const url = URL.createObjectURL(new Blob([resumeEditor.value], { type: "text/markdown" }));
  await chrome.downloads.download({
    url,
    filename: `AutumnApply-${application.job.company}-${application.job.title}.md`.replace(/[\\/:*?"<>|]/g, "-"),
    saveAs: true,
  });
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});
document.querySelector("#download-docx").addEventListener("click", async (event) => {
  if (!resumeEditor.value.trim()) return showStatus("请先生成岗位版简历。", "error");
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const output = await exportResumeDocx(resumeEditor.value, `${application.job.company}-${application.job.title}`);
    const binary = atob(output.dataBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: output.mimeType }));
    await chrome.downloads.download({ url, filename: output.filename, saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    showStatus("Word 岗位版简历已生成；请打开检查分页和字体。", "success");
  } catch (error) {
    showStatus(`Word 导出失败：${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#print-pdf").addEventListener("click", async () => {
  if (!resumeEditor.value.trim()) return showStatus("请先生成岗位版简历。", "error");
  await persist({ announce: false });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`print-resume.html?id=${encodeURIComponent(application.id)}`) });
});
document.querySelectorAll("input[name='submissionMode']").forEach((input) => input.addEventListener("change", async () => {
  if (input.value === "authorized_once" && !confirm("只授权当前岗位执行一次最终提交。系统遇到验证码、法律声明、缺失必填项或无法确认的页面时仍会停止。是否继续？")) {
    document.querySelector("input[name='submissionMode'][value='review']").checked = true;
    return;
  }
  application = setSubmissionMode(application, input.checked ? input.value : "review");
  await persist();
}));
document.querySelector("#open-and-fill").addEventListener("click", async () => {
  await persist({ announce: false });
  if (!application.job.sourceUrl) return showStatus("该招聘线索没有可打开的投递地址。", "error");
  await chrome.tabs.create({ url: application.job.sourceUrl });
  showStatus("岗位页面已打开。请在新标签页点击 AutumnApply 完成填写和提交检查。", "success");
});
