import { createApplicationRecord, markApplicationDecision, upsertApplication } from "./shared/applications.js";
import { createPreparationQuestions, mergePreparationQuestions } from "./shared/application-workflow.js";
import { discoverJobs, normalizeDiscoveryInstructions } from "./shared/discovery.js";
import { createAiDiscoveryOutput, mergeDiscoveryOutputs } from "./shared/discovery-output.js";
import { profileHasUsefulData } from "./shared/profile.js";
import { createDiscoveryProviders, parseCompanySourceText, serializeCompanySources } from "./shared/providers/sources.js";
import { buildWechatSearchPlan, createWechatSearchUrl } from "./shared/providers/wechat.js";
import { normalizeSearchMonitor, SEARCH_ALARM_NAME, updateMonitorAfterSearch } from "./shared/search-monitor.js";
import { loadApplications, loadCompanySources, loadDiscovery, loadProfile, loadSearchMonitor, loadWechatImportedArticles, saveApplications, saveCompanySources, saveDiscovery, saveSearchMonitor } from "./shared/storage.js";
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
let searchMonitor = normalizeSearchMonitor(await loadSearchMonitor());
let importedWechatArticles = await loadWechatImportedArticles();

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
  const coverage = output.coverage ?? {};
  emptyElement.textContent = output.results.length
    ? ""
    : `本次没有可展示的岗位。已读取 ${coverage.fetched ?? 0} 条来源数据；请查看下方来源状态或调整搜索词。`;
  titleElement.textContent = `机会池中展示 ${output.results.length} 个岗位`;
  const sourceSummary = output.sourceStats.map((source) => {
    const querySummary = source.plannedQueries
      ? `（完成 ${source.searchedQueries}/${source.plannedQueries} 组查询）`
      : Number.isFinite(source.returned)
        ? `（返回 ${source.returned} 条，筛选 ${source.candidates ?? source.fetched} 条）`
        : "";
    return `${source.name}读取 ${source.fetched} 条${querySummary}`;
  }).join("；");
  const tiers = [
    `推荐 ${coverage.recommended ?? 0}`,
    `可考虑 ${coverage.potential ?? 0}`,
    `待核验 ${coverage.review ?? 0}`,
    coverage["not-recommended"] ? `不建议 ${coverage["not-recommended"]}` : "",
    coverage.excluded ? `按排除条件隐藏 ${coverage.excluded}` : "",
  ].filter(Boolean).join(" · ");
  summaryElement.textContent = [
    sourceSummary,
    `机会池：读取 ${coverage.fetched ?? 0} 条，评估 ${coverage.considered ?? 0} 条，${tiers}`,
  ].filter(Boolean).join("。 ");
  errorsElement.replaceChildren();
  errorsElement.classList.toggle("hidden", output.errors.length === 0);
  if (output.errors.length) {
    errorsElement.append(`部分结果不完整：${output.errors.join("；")}`);
    const wechat = output.sourceStats.find((source) => source.id === "wechat-sogou");
    const fallback = wechat?.manualSearchUrls?.[0];
    if (fallback) {
      const link = document.createElement("a");
      link.href = fallback.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `在浏览器中继续搜公众号：${fallback.query}`;
      errorsElement.append(document.createElement("br"), link);
    }
  }

  for (const entry of output.results) {
    const card = document.querySelector("#result-template").content.firstElementChild.cloneNode(true);
    card.classList.add(`tier-${entry.tier ?? "review"}`);
    card.querySelector(".company").textContent = entry.job.company;
    card.querySelector(".title").textContent = entry.job.title;
    const tier = {
      recommended: "推荐投递",
      potential: "可考虑",
      review: "待核验",
      "not-recommended": "不建议",
    }[entry.tier] ?? "待核验";
    const tierElement = card.querySelector(".match-tier");
    tierElement.textContent = tier;
    tierElement.classList.add(`tier-${entry.tier ?? "review"}`);
    const wechatType = {
      "company-announcement": "单企业公告",
      roundup: "岗位汇总",
      internship: "实习信息",
      "early-batch": "提前批",
      event: "宣讲/招聘会",
    }[entry.job.metadata?.articleType];
    card.querySelector(".meta").textContent = [
      entry.job.location,
      entry.job.publishedAt,
      entry.job.deadline ? `截止 ${entry.job.deadline}` : "",
      entry.job.sourceName,
      wechatType,
      entry.job.sourcePlatform,
    ].filter(Boolean).join(" · ");
    card.querySelector(".score strong").textContent = entry.assessment.score;
    list(card.querySelector(".strengths"), [...(entry.reasons ?? []), ...entry.assessment.strengths].slice(0, 3), "暂未发现明确优势");
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
    const wechatSearchLink = card.querySelector(".wechat-search-link");
    if (entry.job.sourceType === "wechat-article" && entry.job.metadata?.fallbackSearchUrl) {
      wechatSearchLink.href = entry.job.metadata.fallbackSearchUrl;
      wechatSearchLink.classList.remove("hidden");
    }
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

function currentWechatPlan() {
  const instructions = normalizeDiscoveryInstructions(readInstructions(), profile);
  return buildWechatSearchPlan({
    queries: instructions.queries,
    locations: instructions.locations,
    industries: instructions.industries,
    companyTypes: instructions.companyTypes,
    focusKeywords: instructions.wechatKeywords,
    graduationYear: profile.preferences.graduationYear,
  });
}

async function saveMonitor(instructions, results) {
  searchMonitor = updateMonitorAfterSearch({
    ...searchMonitor,
    enabled: form.elements.monitorEnabled.checked,
    intervalHours: Number(form.elements.intervalHours.value),
    instructions,
  }, results, { searchedAt: new Date().toISOString() });
  await saveSearchMonitor({ ...searchMonitor, newJobs: undefined });
  await chrome.alarms.clear(SEARCH_ALARM_NAME);
  if (searchMonitor.enabled) {
    chrome.alarms.create(SEARCH_ALARM_NAME, { periodInMinutes: searchMonitor.intervalHours * 60 });
    document.querySelector("#monitor-status").textContent = `已保存：每 ${searchMonitor.intervalHours} 小时检查一次；后台不会调用 AI。`;
  } else {
    document.querySelector("#monitor-status").textContent = "自动检查未开启。后台不会运行搜索。";
  }
}

async function persistDiscovery(output) {
  discovery = await saveDiscovery(output);
  await saveMonitor(discovery.instructions, discovery.results);
  renderResults(discovery);
  return discovery;
}

function fillInstructions(instructions) {
  form.elements.queries.value = instructions.queries.join("、");
  form.elements.locations.value = instructions.locations.join("、");
  form.elements.wechatKeywords.value = (instructions.wechatKeywords ?? []).join("、");
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
    importedWechatArticles = await loadWechatImportedArticles();
    const output = await discoverJobs({
      profile,
      instructions: readInstructions(),
      providers: createDiscoveryProviders(fetch, companySources, importedWechatArticles),
      onProgress: (message) => { statusElement.textContent = message; },
    });
    await persistDiscovery(output);
    statusElement.textContent = `完成于 ${new Date(output.searchedAt).toLocaleTimeString()}`;
  } catch (error) {
    emptyElement.classList.remove("hidden");
    emptyElement.textContent = `搜索失败：${error.message}`;
    statusElement.textContent = "";
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#wechat-browser-search").addEventListener("click", async () => {
  const query = currentWechatPlan()[0];
  if (!query) {
    statusElement.textContent = "请先填写目标岗位或在资料库中设置目标方向。";
    return;
  }
  await chrome.tabs.create({ url: createWechatSearchUrl(query) });
  statusElement.textContent = `已在普通浏览器标签页打开“${query}”。如出现验证码，请由你完成；结果页会自动导入公开招聘线索。`;
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
    const aiDiscovery = createAiDiscoveryOutput(output, instructions);
    await persistDiscovery(mergeDiscoveryOutputs(discovery, aiDiscovery));
    const stats = output.searchStats;
    statusElement.textContent = stats?.provider === "zhipu"
      ? `GLM 联网检索返回 ${stats.returned} 条，去重和条件过滤后展示 ${stats.displayed} 条；每条仍需核验来源。`
      : `AI补充搜索完成；核验 ${output.opportunities.length} 条来源`;
  } catch (error) {
    errorsElement.classList.remove("hidden");
    errorsElement.textContent = `AI联网搜索失败：${error.message}`;
    statusElement.textContent = "";
  } finally {
    aiButton.disabled = false;
  }
});

form.elements.companySources.value = serializeCompanySources(companySources);
form.elements.monitorEnabled.checked = searchMonitor.enabled;
form.elements.intervalHours.value = String(searchMonitor.intervalHours);
if (searchMonitor.lastRunAt) {
  document.querySelector("#monitor-status").textContent = searchMonitor.lastError
    ? `上次检查失败：${searchMonitor.lastError}`
    : `上次检查：${new Date(searchMonitor.lastRunAt).toLocaleString()}；后台不会调用 AI。`;
}

if (!profileHasUsefulData(profile)) {
  button.disabled = true;
  emptyElement.textContent = "请先在个人资料库中填写姓名、联系方式、教育经历和技能。";
} else {
  const initial = discovery?.instructions ?? normalizeDiscoveryInstructions({}, profile);
  fillInstructions(initial);
  if (discovery?.results) renderResults(discovery);
}
