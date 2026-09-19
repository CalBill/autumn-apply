import { createEmptyProfile, newId, normalizeProfile, splitList, validateProfile } from "./shared/profile.js";
import { clearLocalData, loadProfile, saveProfile } from "./shared/storage.js";

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
    preferences: {
      roles: splitList(named.get("roles")),
      locations: splitList(named.get("locations")),
      graduationYear: named.get("graduationYear"),
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
  form.elements.namedItem("graduationYear").value = profile.preferences.graduationYear;
  form.elements.namedItem("minimumScore").value = profile.preferences.minimumScore;

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
  showStatus("本机数据已清除", "success");
});

renderProfile(await loadProfile());
