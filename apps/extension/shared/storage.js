import { createEmptyProfile, normalizeProfile } from "./profile.js";

export const STORAGE_KEYS = {
  profile: "candidateProfile",
  applications: "applications",
  draft: "currentDraft",
};

function storageArea() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error("Chrome local storage is unavailable");
  }
  return globalThis.chrome.storage.local;
}

export async function loadProfile() {
  const result = await storageArea().get(STORAGE_KEYS.profile);
  return result[STORAGE_KEYS.profile]
    ? normalizeProfile(result[STORAGE_KEYS.profile])
    : createEmptyProfile();
}

export async function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  await storageArea().set({ [STORAGE_KEYS.profile]: normalized });
  return normalized;
}

export async function clearLocalData() {
  await storageArea().remove(Object.values(STORAGE_KEYS));
}
