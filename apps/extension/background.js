import { discoverJobs } from "./shared/discovery.js";
import { profileHasUsefulData } from "./shared/profile.js";
import { createDiscoveryProviders } from "./shared/providers/sources.js";
import { parseSogouWechatArticles } from "./shared/providers/wechat.js";
import { findUpcomingDeadlines, normalizeSearchMonitor, SEARCH_ALARM_NAME, updateMonitorAfterSearch } from "./shared/search-monitor.js";
import { loadCompanySources, loadProfile, loadSearchMonitor, loadWechatImportedArticles, saveDiscovery, saveSearchMonitor, saveWechatImportedArticles } from "./shared/storage.js";

async function runMonitor() {
  const monitor = normalizeSearchMonitor(await loadSearchMonitor());
  if (!monitor.enabled || !monitor.instructions) return;
  const profile = await loadProfile();
  if (!profileHasUsefulData(profile)) return;
  try {
    const output = await discoverJobs({
      profile,
      instructions: monitor.instructions,
      providers: createDiscoveryProviders(fetch, await loadCompanySources()),
    });
    const updated = updateMonitorAfterSearch(monitor, output.results, { searchedAt: output.searchedAt });
    const deadlines = findUpcomingDeadlines(output.results, monitor);
    updated.deadlineNotifiedJobIds = [...new Set([
      ...monitor.deadlineNotifiedJobIds,
      ...deadlines.map((job) => String(job.id)),
    ])].slice(-2_000);
    await saveDiscovery(output);
    await saveSearchMonitor({ ...updated, newJobs: undefined });
    if (updated.newJobs.length) {
      await chrome.notifications.create("autumn-apply-new-jobs", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon.svg"),
        title: `发现 ${updated.newJobs.length} 个新岗位`,
        message: updated.newJobs.slice(0, 3).map((job) => `${job.company} · ${job.title}`).join("；"),
        priority: 1,
      });
    }
    if (deadlines.length) {
      await chrome.notifications.create("autumn-apply-deadlines", {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon.svg"),
        title: `${deadlines.length} 个岗位即将在七天内截止`,
        message: deadlines.slice(0, 3).map((job) => `${job.company} · ${job.title} · ${job.deadline}`).join("；"),
        priority: 2,
      });
    }
  } catch (error) {
    const updated = updateMonitorAfterSearch(monitor, [], { error: error.message });
    await saveSearchMonitor({ ...updated, newJobs: undefined });
  }
}

chrome.runtime.onInstalled.addListener(() => runMonitor());
chrome.runtime.onStartup.addListener(() => runMonitor());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SEARCH_ALARM_NAME) runMonitor();
});
chrome.notifications.onClicked.addListener((notificationId) => {
  if (["autumn-apply-new-jobs", "autumn-apply-deadlines"].includes(notificationId)) chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "autumnapply:wechat-results-page") return undefined;
  (async () => {
    const articles = parseSogouWechatArticles(String(message.html ?? ""), String(message.query ?? ""))
      .map((article) => ({
        ...article,
        metadata: { ...article.metadata, importedFromBrowser: true },
      }));
    const existing = await loadWechatImportedArticles();
    const saved = await saveWechatImportedArticles([...existing, ...articles]);
    sendResponse({ imported: articles.length, total: saved.length });
  })().catch((error) => sendResponse({ imported: 0, error: error.message }));
  return true;
});
