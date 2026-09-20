import { createEmptyProfile, newId, normalizeProfile, splitList, validateProfile } from "./shared/profile.js";
import { STATUS_LABELS } from "./shared/applications.js";
import { clearLocalData, loadApplications, loadProfile, saveProfile } from "./shared/storage.js";
import { deleteProviderKey, getLocalApiHealth, getProviderSettings, parseResumeFile, saveProviderSettings, structureResumeWithAi, testProviderConnection } from "./shared/local-api.js";

const form = document.querySelector("#profile-form");
const status = document.querySelector("#save-status");
const lists = {
  education: document.querySelector("#education-list"),
  experiences: document.querySelector("#experiences-list"),
  projects: document.querySelector("#projects-list"),
  commonAnswers: document.querySelector("#common-answers-list"),
};

function showStatus(message, kind = "") {
  status.textContent = message;
  status.className = kind;
}

function setEntryValues(element, data) {
  for (const field of element.querySelectorAll("[data-field]")) {
    const value = data[field.dataset.field];
    field.value = Array.isArray(value) ? value.join("\n") : value ?? "";
  }
}

function wireEntry(element) {
  element.querySelector("[data-remove]").addEventListener("click", () => element.remove());
  return element;
}

function renderEmptyState(list, message) {
  if (!list.children.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    empty.dataset.empty = "true";
    list.append(empty);
  }
}

function clearEmptyState(list) {
  list.querySelector("[data-empty]")?.remove();
}

function addEducation(data = {}) {
  clearEmptyState(lists.education);
  const entry = wireEntry(document.querySelector("#education-template").content.firstElementChild.cloneNode(true));
  setEntryValues(entry, { id: newId("education"), ...data });
  lists.education.append(entry);
}

function addStory(kind, data = {}) {
  clearEmptyState(lists[kind]);
  const entry = wireEntry(document.querySelector("#story-template").content.firstElementChild.cloneNode(true));
  entry.querySelector("[data-card-title]").textContent = kind === "projects" ? "项目" : "实习 / 工作经历";
  setEntryValues(entry, { id: newId(kind === "projects" ? "project" : "experience"), ...data });
  lists[kind].append(entry);
}

function addAnswer(data = {}) {
  clearEmptyState(lists.commonAnswers);
  const entry = wireEntry(document.querySelector("#answer-template").content.firstElementChild.cloneNode(true));
  setEntryValues(entry, { id: newId("answer"), ...data });
  lists.commonAnswers.append(entry);
}

function entryData(element) {
  return Object.fromEntries([...element.querySelectorAll("[data-field]")].map((field) => [field.dataset.field, field.value]));
}

function collectProfile() {
  const named = new FormData(form);
  return normalizeProfile({
    id: form.dataset.profileId,
    personal: {
      fullName: named.get("fullName"),
      email: named.get("email"),
      phone: named.get("phone"),
      city: named.get("city"),
      github: named.get("github"),
      website: named.get("website"),
    },
    education: [...lists.education.querySelectorAll("[data-entry='education']")].map(entryData),
    experiences: [...lists.experiences.querySelectorAll("[data-entry='story']")].map(entryData),
    projects: [...lists.projects.querySelectorAll("[data-entry='story']")].map(entryData),
    commonAnswers: [...lists.commonAnswers.querySelectorAll("[data-entry='answer']")].map(entryData),
    skills: splitList(named.get("skills")),
    qualifications: {
      politicalStatus: named.get("politicalStatus"),
      certificates: splitList(named.get("certificates")),
      languages: splitList(named.get("languages")),
    },
    preferences: {
      roles: splitList(named.get("roles")),
      locations: splitList(named.get("locations")),
      industries: splitList(named.get("industries")),
      companyTypes: splitList(named.get("companyTypes")),
      requiredKeywords: splitList(named.get("requiredKeywords")),
      excludedKeywords: splitList(named.get("excludedKeywords")),
      campusOnly: named.get("campusOnly") === "on",
      graduationYear: named.get("graduationYear"),
      experienceYears: named.get("experienceYears"),
      minimumScore: named.get("minimumScore"),
    },
  });
}

function renderProfile(profile) {
  form.dataset.profileId = profile.id;
  for (const [name, value] of Object.entries(profile.personal)) {
    const input = form.elements.namedItem(name);
    if (input) input.value = value;
  }
  form.elements.namedItem("skills").value = profile.skills.join("、");
  form.elements.namedItem("roles").value = profile.preferences.roles.join("、");
  form.elements.namedItem("locations").value = profile.preferences.locations.join("、");
  form.elements.namedItem("industries").value = profile.preferences.industries.join("、");
  form.elements.namedItem("companyTypes").value = profile.preferences.companyTypes.join("、");
  form.elements.namedItem("requiredKeywords").value = profile.preferences.requiredKeywords.join("、");
  form.elements.namedItem("excludedKeywords").value = profile.preferences.excludedKeywords.join("、");
  form.elements.namedItem("campusOnly").checked = profile.preferences.campusOnly;
  form.elements.namedItem("graduationYear").value = profile.preferences.graduationYear;
  form.elements.namedItem("experienceYears").value = profile.preferences.experienceYears;
  form.elements.namedItem("minimumScore").value = profile.preferences.minimumScore;
  form.elements.namedItem("politicalStatus").value = profile.qualifications.politicalStatus;
  form.elements.namedItem("certificates").value = profile.qualifications.certificates.join("、");
  form.elements.namedItem("languages").value = profile.qualifications.languages.join("、");

  for (const list of Object.values(lists)) list.replaceChildren();
  profile.education.forEach(addEducation);
  profile.experiences.forEach((item) => addStory("experiences", item));
  profile.projects.forEach((item) => addStory("projects", item));
  profile.commonAnswers.forEach(addAnswer);

  renderEmptyState(lists.education, "还没有教育经历，请添加一段。");
  renderEmptyState(lists.experiences, "可稍后添加实习或工作经历。");
  renderEmptyState(lists.projects, "可稍后添加项目经历。");
  renderEmptyState(lists.commonAnswers, "可保存自我介绍、求职动机等常见答案素材。");
}

function renderApplications(applications) {
  const rows = document.querySelector("#application-rows");
  const empty = document.querySelector("#application-empty");
  rows.replaceChildren();
  empty.hidden = applications.length > 0;
  for (const application of applications) {
    const row = document.createElement("tr");
    const jobCell = document.createElement("td");
    const title = document.createElement("strong");
    title.textContent = `${application.job.company} · ${application.job.title}`;
    jobCell.append(title);
    if (application.job.location) jobCell.append(document.createElement("br"), application.job.location);
    const scoreCell = document.createElement("td");
    scoreCell.textContent = String(application.score ?? "—");
    const statusCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "status-pill";
    pill.textContent = STATUS_LABELS[application.status] ?? application.status;
    statusCell.append(pill);
    const updatedCell = document.createElement("td");
    updatedCell.textContent = new Date(application.updatedAt).toLocaleString();
    const sourceCell = document.createElement("td");
    if (application.job.sourceUrl) {
      const link = document.createElement("a");
      link.href = application.job.sourceUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = application.job.sourcePlatform || "打开";
      sourceCell.append(link);
    } else sourceCell.textContent = "—";
    if (application.decision === "apply") {
      const prepareLink = document.createElement("a");
      prepareLink.href = `prepare.html?id=${encodeURIComponent(application.id)}`;
      prepareLink.textContent = "准备申请";
      prepareLink.style.marginLeft = "0.7rem";
      sourceCell.append(prepareLink);
    }
    row.append(jobCell, scoreCell, statusCell, updatedCell, sourceCell);
    rows.append(row);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = collectProfile();
  const errors = validateProfile(profile);
  if (errors.length) {
    showStatus(errors.join("；"), "error");
    return;
  }
  await saveProfile(profile);
  renderProfile(profile);
  showStatus(`已保存在本机 · ${new Date().toLocaleTimeString()}`, "success");
});

document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => {
    const kind = button.dataset.add;
    if (kind === "education") addEducation();
    else if (kind === "commonAnswers") addAnswer();
    else addStory(kind);
  });
});

document.querySelector("#export-profile").addEventListener("click", () => {
  const profile = collectProfile();
  const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "autumn-apply-profile.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#import-profile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const profile = normalizeProfile(JSON.parse(await file.text()));
    const errors = validateProfile(profile);
    if (errors.length) throw new Error(errors.join("；"));
    await saveProfile(profile);
    renderProfile(profile);
    showStatus("资料备份已导入并保存在本机", "success");
  } catch (error) {
    showStatus(`导入失败：${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#clear-data").addEventListener("click", async () => {
  if (!confirm("确定清除 AutumnApply 在当前浏览器保存的全部资料和投递记录吗？此操作无法撤销。")) return;
  await clearLocalData();
  renderProfile(createEmptyProfile());
  renderApplications([]);
  showStatus("本机数据已清除", "success");
});

renderProfile(await loadProfile());
renderApplications(await loadApplications());

const localApiStatus = document.querySelector("#local-api-status");
const providerForm = document.querySelector("#provider-form");
const providerStatus = document.querySelector("#provider-status");
const aiStructureButton = document.querySelector("#ai-structure-resume");
let parsedResumeText = "";

function showIntegrationStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = kind;
}

async function refreshProviderSettings() {
  const settings = await getProviderSettings();
  providerForm.elements.provider.value = settings.provider;
  providerForm.elements.model.value = settings.model;
  showIntegrationStatus(providerStatus, settings.apiKeyConfigured
    ? `已配置密钥（${settings.apiKeySource === "environment" ? "环境变量" : "系统钥匙串"}）`
    : "尚未配置API Key", settings.apiKeyConfigured ? "success" : "");
}

try {
  const health = await getLocalApiHealth();
  showIntegrationStatus(localApiStatus, `本机服务在线 · v${health.version}`, "online");
  await refreshProviderSettings();
} catch (error) {
  showIntegrationStatus(localApiStatus, error.message, "offline");
  providerForm.querySelectorAll("input, select, button").forEach((element) => { element.disabled = true; });
}

document.querySelector("#resume-import").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  const importStatus = document.querySelector("#resume-import-status");
  if (!file) return;
  try {
    showIntegrationStatus(importStatus, "正在本机解析简历…");
    const result = await parseResumeFile(file);
    parsedResumeText = result.text;
    aiStructureButton.disabled = false;
    const draft = result.profileDraft;
    for (const [name, value] of Object.entries(draft.personal)) {
      const input = form.elements.namedItem(name);
      if (input && !input.value && value) input.value = value;
    }
    const existingSkills = splitList(form.elements.namedItem("skills").value);
    form.elements.namedItem("skills").value = [...new Set([...existingSkills, ...draft.skills])].join("、");
    if (!form.elements.namedItem("graduationYear").value) {
      form.elements.namedItem("graduationYear").value = draft.yearSignals.at(-1) ?? "";
    }
    showIntegrationStatus(importStatus, `已提取 ${result.text.length} 个字符；请核对后点击“保存资料”`, "success");
  } catch (error) {
    showIntegrationStatus(importStatus, error.message, "error");
  } finally {
    event.target.value = "";
  }
});

aiStructureButton.addEventListener("click", async () => {
  const importStatus = document.querySelector("#resume-import-status");
  if (!parsedResumeText) return;
  aiStructureButton.disabled = true;
  try {
    showIntegrationStatus(importStatus, "正在将简历文本发送给已配置的模型进行结构化…");
    const { profile: draft } = await structureResumeWithAi(parsedResumeText);
    const current = collectProfile();
    const merged = normalizeProfile({
      ...current,
      personal: Object.fromEntries(Object.keys(current.personal).map((key) => [key, current.personal[key] || draft.personal?.[key] || ""])),
      education: current.education.length ? current.education : draft.education,
      experiences: current.experiences.length ? current.experiences : draft.experiences,
      projects: current.projects.length ? current.projects : draft.projects,
      skills: [...new Set([...current.skills, ...(draft.skills ?? [])])],
      qualifications: {
        politicalStatus: current.qualifications.politicalStatus || draft.qualifications?.politicalStatus,
        certificates: [...new Set([...current.qualifications.certificates, ...(draft.qualifications?.certificates ?? [])])],
        languages: [...new Set([...current.qualifications.languages, ...(draft.qualifications?.languages ?? [])])],
      },
      preferences: {
        ...current.preferences,
        roles: current.preferences.roles.length ? current.preferences.roles : draft.preferences?.roles,
        locations: current.preferences.locations.length ? current.preferences.locations : draft.preferences?.locations,
        industries: current.preferences.industries.length ? current.preferences.industries : draft.preferences?.industries,
        companyTypes: current.preferences.companyTypes.length ? current.preferences.companyTypes : draft.preferences?.companyTypes,
        requiredKeywords: current.preferences.requiredKeywords.length ? current.preferences.requiredKeywords : draft.preferences?.requiredKeywords,
        excludedKeywords: current.preferences.excludedKeywords.length ? current.preferences.excludedKeywords : draft.preferences?.excludedKeywords,
        graduationYear: current.preferences.graduationYear || draft.preferences?.graduationYear,
      },
    });
    renderProfile(merged);
    showIntegrationStatus(importStatus, "AI结构化结果已填入；尚未保存，请逐项核对事实后点击“保存资料”", "success");
  } catch (error) {
    showIntegrationStatus(importStatus, error.message, "error");
  } finally {
    aiStructureButton.disabled = false;
  }
});

providerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(providerForm);
  try {
    const settings = await saveProviderSettings(Object.fromEntries(data.entries()));
    providerForm.elements.apiKey.value = "";
    showIntegrationStatus(providerStatus, settings.apiKeyConfigured ? "AI配置已保存，密钥位于安全存储" : "配置已保存，但尚未提供密钥", settings.apiKeyConfigured ? "success" : "");
  } catch (error) {
    showIntegrationStatus(providerStatus, error.message, "error");
  }
});

document.querySelector("#delete-provider-key").addEventListener("click", async () => {
  try {
    await deleteProviderKey();
    providerForm.elements.apiKey.value = "";
    showIntegrationStatus(providerStatus, "密钥已从安全存储删除", "success");
  } catch (error) {
    showIntegrationStatus(providerStatus, error.message, "error");
  }
});

document.querySelector("#test-provider").addEventListener("click", async () => {
  try {
    showIntegrationStatus(providerStatus, "正在测试模型连接；这会产生一次很小的API调用…");
    const result = await testProviderConnection();
    showIntegrationStatus(providerStatus, `${result.provider} · ${result.model}：${result.message}`, "success");
  } catch (error) {
    showIntegrationStatus(providerStatus, error.message, "error");
  }
});
