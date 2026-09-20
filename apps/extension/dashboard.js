import { STATUS_LABELS } from "./shared/applications.js";
import { getLocalApiHealth, getProviderSettings } from "./shared/local-api.js";
import { profileReadiness } from "./shared/profile.js";
import { loadApplications, loadDiscovery, loadProfile } from "./shared/storage.js";

const profile = await loadProfile();
const applications = await loadApplications();
const discovery = await loadDiscovery();
const readiness = profileReadiness(profile);
let apiOnline = false;
let aiConfigured = false;
try {
  await getLocalApiHealth();
  apiOnline = true;
  aiConfigured = (await getProviderSettings()).apiKeyConfigured === true;
} catch {
  apiOnline = false;
}

const steps = [
  { label: "本机服务", complete: apiOnline, detail: apiOnline ? "在线" : "尚未启动", href: "options.html" },
  { label: "个人资料", complete: readiness.score >= 75, detail: `${readiness.score}% 完整`, href: "options.html" },
  { label: "求职偏好", complete: profile.preferences.roles.length > 0 && profile.preferences.locations.length > 0, detail: profile.preferences.roles.length ? profile.preferences.roles.slice(0, 2).join("、") : "尚未填写", href: "options.html" },
  { label: "AI增强", complete: aiConfigured, optional: true, detail: aiConfigured ? "已配置" : "可选，未配置", href: "options.html" },
  { label: "首个申请", complete: applications.some((item) => item.decision === "apply"), detail: applications.some((item) => item.decision === "apply") ? "已建立" : "还未选择要投岗位", href: "discover.html" },
];
const setup = document.querySelector("#setup-steps");
for (const step of steps) {
  const card = document.createElement("article");
  card.className = `setup-step${step.complete ? " complete" : ""}`;
  const title = document.createElement("strong");
  title.textContent = `${step.complete ? "✓" : step.optional ? "○" : "•"} ${step.label}`;
  const detail = document.createElement("small");
  detail.textContent = step.detail;
  const link = document.createElement("a");
  link.href = step.href;
  link.textContent = step.complete ? "查看" : "去完成";
  card.append(title, detail, link);
  setup.append(card);
}
const requiredSteps = steps.filter((item) => !item.optional);
const completed = requiredSteps.filter((item) => item.complete).length;
const progress = Math.round(completed / requiredSteps.length * 100);
document.querySelector("#overall-progress").textContent = `${progress}%`;
document.querySelector("#progress-bar").style.width = `${progress}%`;

document.querySelector("#metric-discovered").textContent = String(discovery?.results?.length ?? 0);
document.querySelector("#metric-preparing").textContent = String(applications.filter((item) => item.status === "preparing").length);
document.querySelector("#metric-ready").textContent = String(applications.filter((item) => item.status === "prepared").length);
document.querySelector("#metric-submitted").textContent = String(applications.filter((item) => item.status === "submitted").length);

const list = document.querySelector("#application-list");
const empty = document.querySelector("#application-empty");
let currentFilter = "active";
function filteredApplications() {
  if (currentFilter === "withdrawn") return applications.filter((item) => item.status === "withdrawn");
  if (currentFilter === "active") return applications.filter((item) => !["withdrawn", "rejected", "submitted"].includes(item.status));
  return applications;
}
function renderApplications() {
  list.replaceChildren();
  const records = filteredApplications();
  empty.hidden = records.length > 0;
  for (const application of records) {
    const card = document.createElement("article");
    card.className = "application-card";
    const info = document.createElement("div");
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = STATUS_LABELS[application.status] ?? application.status;
    const title = document.createElement("h3");
    title.textContent = `${application.job.company} · ${application.job.title}`;
    const meta = document.createElement("p");
    meta.textContent = [application.job.location, `${application.score ?? "—"} 分`, new Date(application.updatedAt).toLocaleString()].filter(Boolean).join(" · ");
    info.append(status, title, meta);
    const actions = document.createElement("div");
    actions.className = "application-actions";
    if (application.decision === "apply") {
      const prepare = document.createElement("a");
      prepare.className = "primary";
      prepare.href = `prepare.html?id=${encodeURIComponent(application.id)}`;
      prepare.textContent = application.status === "prepared" ? "检查材料" : "继续准备";
      actions.append(prepare);
    }
    if (application.job.sourceUrl) {
      const source = document.createElement("a");
      source.className = "secondary";
      source.href = application.job.sourceUrl;
      source.target = "_blank";
      source.rel = "noreferrer";
      source.textContent = "原始岗位";
      actions.append(source);
    }
    card.append(info, actions);
    list.append(card);
  }
}
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  currentFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("selected", item === button));
  renderApplications();
}));
renderApplications();

if (discovery?.searchedAt) {
  const sources = (discovery.sourceStats ?? []).map((item) => `${item.name} ${item.fetched} 条`).join("；");
  document.querySelector("#search-summary").textContent = `${new Date(discovery.searchedAt).toLocaleString()}：${discovery.results?.length ?? 0} 个候选岗位。${sources}`;
}
