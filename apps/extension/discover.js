import { createApplicationRecord, markApplicationDecision, upsertApplication } from "./shared/applications.js";
import { createPreparationQuestions, mergePreparationQuestions } from "./shared/application-workflow.js";
import { discoverJobs, normalizeDiscoveryInstructions } from "./shared/discovery.js";
import { profileHasUsefulData } from "./shared/profile.js";
import { createDiscoveryProviders, parseCompanySourceText, serializeCompanySources } from "./shared/providers/sources.js";
import { loadApplications, loadCompanySources, loadDiscovery, loadProfile, saveApplications, saveCompanySources, saveDiscovery } from "./shared/storage.js";
import { analyzeJobWithAi, searchJobsWithAi } from "./shared/local-api.js";

const form = document.querySelector("#search-form");
const button = document.querySelector("#search-button");
const resultsElement = document.querySelector("#results");
const emptyElement = document.querySelector("#empty");
const statusElement = document.querySelector("#search-status");
const errorsElement = document.querySelector("#errors");
const titleElement = document.querySelector("#result-title");
const summaryElement = document.querySelector("#result-summary");
let profile = await loadProfile();
let applications = await loadApplications();
let discovery = await loadDiscovery();
let companySources = await loadCompanySources();

function list(element, items, emptyText) {
  element.replaceChildren();
  for (const value of items.length ? items : [emptyText]) {
    const item = document.createElement("li");
    item.textContent = value;
    element.append(item);
  }
}

function renderResults(output) {
  resultsElement.replaceChildren();
  emptyElement.classList.toggle("hidden", output.results.length > 0);
  emptyElement.textContent = output.results.length ? "" : "没有岗位同时满足当前地点、关键词和分数条件。可以适当放宽条件重试。";
  titleElement.textContent = `找到 ${output.results.length} 个候选岗位`;
  summaryElement.textContent = output.sourceStats.map((source) => `${source.name}读取 ${source.fetched} 条`).join("；");
  errorsElement.classList.toggle("hidden", output.errors.length === 0);
  errorsElement.textContent = output.errors.length ? `部分结果不完整：${output.errors.join("；")}` : "";

  for (const entry of output.results) {
    const card = document.querySelector("#result-template").content.firstElementChild.cloneNode(true);
    card.querySelector(".company").textContent = entry.job.company;
    card.querySelector(".title").textContent = entry.job.title;
    card.querySelector(".meta").textContent = [entry.job.location, entry.job.publishedAt, entry.job.sourcePlatform].filter(Boolean).join(" · ");
    card.querySelector(".score strong").textContent = entry.assessment.score;
    list(card.querySelector(".strengths"), entry.assessment.strengths.slice(0, 3), "暂未发现明确优势");
    list(card.querySelector(".gaps"), [...entry.assessment.gaps, ...entry.assessment.warnings].slice(0, 3), "没有明显提醒");
    const sourceKind = card.querySelector(".source-kind");
    sourceKind.textContent = entry.job.sourceType === "wechat-article"
      ? "公众号招聘信息"
      : entry.job.sourceType === "ai-web-search"
        ? (entry.job.sourceVerified ? "AI联网 · 已核验" : "AI联网 · 待核验")
        : "企业官网岗位";
    sourceKind.classList.toggle("unverified", !entry.job.sourceVerified);
    const link = card.querySelector(".job-link");
    link.href = entry.job.sourceUrl;
    link.textContent = entry.job.sourceType === "wechat-article" ? "查看原始文章" : "查看官方岗位";
    const applyButton = card.querySelector(".apply-job");
    const skipButton = card.querySelector(".skip-job");
    const existing = applications.find((item) => item.jobId === entry.job.id);
    if (existing?.decision === "apply") applyButton.textContent = "继续准备申请";
    if (existing?.decision === "skip") skipButton.textContent = "已选择不投";
    applyButton.addEventListener("click", async () => {
      const current = applications.find((item) => item.jobId === entry.job.id);
      let record = current ?? createApplicationRecord({ assessment: entry.assessment }, "shortlisted");
      record = markApplicationDecision({ ...record, job: entry.job, assessment: entry.assessment, score: entry.assessment.score }, "apply");
      const generated = createPreparationQuestions(profile, entry.assessment);
      record.preparation = {
        questions: mergePreparationQuestions(record.preparation?.questions, generated),
        resumeVariant: record.preparation?.resumeVariant ?? null,
        notes: record.preparation?.notes ?? "",
      };
      applications = upsertApplication(applications, record);
      await saveApplications(applications);
      applyButton.textContent = "继续准备申请";
      await chrome.tabs.create({ url: chrome.runtime.getURL(`prepare.html?id=${encodeURIComponent(record.id)}`) });
    });
    skipButton.addEventListener("click", async () => {
      const current = applications.find((item) => item.jobId === entry.job.id);
      let record = current ?? createApplicationRecord({ assessment: entry.assessment }, "shortlisted");
      const reason = prompt("可选：为什么不投这个岗位？这会帮助你以后回顾。", record.decisionReason ?? "");
      if (reason === null) return;
      record = markApplicationDecision({ ...record, job: entry.job, assessment: entry.assessment, score: entry.assessment.score }, "skip", reason);
      applications = upsertApplication(applications, record);
      await saveApplications(applications);
      skipButton.textContent = "已选择不投";
    });
    const aiButton = card.querySelector(".ai-match");
    const aiResult = card.querySelector(".ai-result");
    aiButton.addEventListener("click", async () => {
      aiButton.disabled = true;
      aiButton.textContent = "分析中…";
      try {
        const output = await analyzeJobWithAi(profile, entry.job);
        const assessment = output.assessment;
        card.querySelector(".ai-score").textContent = `${assessment.score}分 · ${assessment.recommendation}`;
        card.querySelector(".ai-summary").textContent = assessment.summary;
        list(card.querySelector(".ai-requirements"), assessment.hardRequirements.slice(0, 6).map((item) => {
          const label = { met: "满足", not_met: "不满足", unknown: "待确认" }[item.status] ?? item.status;
          return `${label}：${item.requirement}${item.candidateEvidence ? `（${item.candidateEvidence}）` : ""}`;
        }), "未识别到明确硬条件");
        aiResult.classList.remove("hidden");
        aiButton.textContent = "重新分析";
      } catch (error) {
        aiButton.textContent = error.message;
      } finally {
        aiButton.disabled = false;
      }
    });
    resultsElement.append(card);
  }
}

function readInstructions() {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function fillInstructions(instructions) {
  form.elements.queries.value = instructions.queries.join("、");
  form.elements.locations.value = instructions.locations.join("、");
  form.elements.requiredKeywords.value = instructions.requiredKeywords.join("、");
  form.elements.excludedKeywords.value = instructions.excludedKeywords.join("、");
  form.elements.minimumScore.value = instructions.minimumScore;
  form.elements.maxResults.value = instructions.maxResults;
  form.elements.recentDays.value = instructions.recentDays;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  resultsElement.replaceChildren();
  emptyElement.classList.add("hidden");
  errorsElement.classList.add("hidden");
  try {
    const parsedSources = parseCompanySourceText(form.elements.companySources.value);
    if (parsedSources.errors.length) throw new Error(parsedSources.errors.join("；"));
    companySources = await saveCompanySources(parsedSources.sources);
    const output = await discoverJobs({
      profile,
      instructions: readInstructions(),
      providers: createDiscoveryProviders(fetch, companySources),
      onProgress: (message) => { statusElement.textContent = message; },
    });
    discovery = await saveDiscovery(output);
    renderResults(discovery);
    statusElement.textContent = `完成于 ${new Date(output.searchedAt).toLocaleTimeString()}`;
  } catch (error) {
    emptyElement.classList.remove("hidden");
    emptyElement.textContent = `搜索失败：${error.message}`;
    statusElement.textContent = "";
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#ai-search-button").addEventListener("click", async (event) => {
  const aiButton = event.currentTarget;
  aiButton.disabled = true;
  statusElement.textContent = "AI正在联网检索并逐条核验来源…";
  try {
    const instructions = normalizeDiscoveryInstructions(readInstructions(), profile);
    const output = await searchJobsWithAi(profile, {
      roles: instructions.queries,
      locations: instructions.locations,
      requiredKeywords: instructions.requiredKeywords,
      excludedKeywords: instructions.excludedKeywords,
      maximumResults: Math.min(20, instructions.maxResults),
    });
    renderResults({
      results: output.opportunities.map((item) => {
        const job = {
          id: item.id, providerId: item.sourceUrl, title: item.title, company: item.company, location: item.location,
          description: item.description, sourceUrl: item.sourceUrl, sourcePlatform: `AI联网检索 · ${item.verification.status}`,
          sourceType: "ai-web-search", sourceVerified: item.verification.status === "verified", publishedAt: item.publishedAt,
        };
        return { job, assessment: {
          job,
          score: item.matchScore, strengths: [item.matchReason], gaps: item.hardRequirementRisk ? [item.hardRequirementRisk] : [],
          matchedSkills: [], missingSkills: [], hardRequirementsMet: true, passedThreshold: true,
          warnings: item.verification.status === "verified"
            ? []
            : [item.verification.status === "reachable"
              ? "来源页面可达，但正文信号尚未完全核验"
              : "来源页面当前无法访问，投递前必须人工核对"],
        } };
      }),
      sourceStats: [{ name: "AI联网搜索", fetched: output.opportunities.length }],
      errors: [],
      searchedAt: output.searchedAt,
    });
    statusElement.textContent = `AI补充搜索完成；核验 ${output.opportunities.length} 条来源`;
  } catch (error) {
    errorsElement.classList.remove("hidden");
    errorsElement.textContent = `AI联网搜索失败：${error.message}`;
    statusElement.textContent = "";
  } finally {
    aiButton.disabled = false;
  }
});

form.elements.companySources.value = serializeCompanySources(companySources);

if (!profileHasUsefulData(profile)) {
  button.disabled = true;
  emptyElement.textContent = "请先在个人资料库中填写姓名、联系方式、教育经历和技能。";
} else {
  const initial = discovery?.instructions ?? normalizeDiscoveryInstructions({}, profile);
  fillInstructions(initial);
  if (discovery?.results) renderResults(discovery);
}
