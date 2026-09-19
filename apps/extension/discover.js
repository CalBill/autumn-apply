import { createApplicationRecord, upsertApplication } from "./shared/applications.js";
import { discoverJobs, normalizeDiscoveryInstructions } from "./shared/discovery.js";
import { profileHasUsefulData } from "./shared/profile.js";
import { createDiscoveryProviders } from "./shared/providers/sources.js";
import { loadApplications, loadDiscovery, loadProfile, saveApplications, saveDiscovery } from "./shared/storage.js";

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
    sourceKind.textContent = entry.job.sourceType === "wechat-article" ? "公众号招聘信息" : "企业官网岗位";
    sourceKind.classList.toggle("unverified", !entry.job.sourceVerified);
    const link = card.querySelector(".job-link");
    link.href = entry.job.sourceUrl;
    link.textContent = entry.job.sourceType === "wechat-article" ? "查看原始文章" : "查看官方岗位";
    const shortlist = card.querySelector(".shortlist");
    const existing = applications.some((item) => item.jobId === entry.job.id);
    if (existing) {
      shortlist.textContent = "已加入候选";
      shortlist.classList.add("saved");
    }
    shortlist.addEventListener("click", async () => {
      const record = createApplicationRecord({ assessment: entry.assessment }, "shortlisted");
      applications = upsertApplication(applications, record);
      await saveApplications(applications);
      shortlist.textContent = "已加入候选";
      shortlist.classList.add("saved");
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
    const output = await discoverJobs({
      profile,
      instructions: readInstructions(),
      providers: createDiscoveryProviders(),
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

if (!profileHasUsefulData(profile)) {
  button.disabled = true;
  emptyElement.textContent = "请先在个人资料库中填写姓名、联系方式、教育经历和技能。";
} else {
  const initial = discovery?.instructions ?? normalizeDiscoveryInstructions({}, profile);
  fillInstructions(initial);
  if (discovery?.results) renderResults(discovery);
}
