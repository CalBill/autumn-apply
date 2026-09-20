import { discoverJobs } from "./shared/discovery.js";
import { profileHasUsefulData } from "./shared/profile.js";
import { createDiscoveryProviders } from "./shared/providers/sources.js";
import { normalizeSearchMonitor, SEARCH_ALARM_NAME, updateMonitorAfterSearch } from "./shared/search-monitor.js";
import { loadCompanySources, loadProfile, loadSearchMonitor, saveDiscovery, saveSearchMonitor } from "./shared/storage.js";

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
  if (notificationId === "autumn-apply-new-jobs") chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});
