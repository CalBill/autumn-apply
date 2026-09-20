export const LOCAL_API_ORIGIN = "http://127.0.0.1:43127";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${LOCAL_API_ORIGIN}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
  } catch {
    throw new Error("无法连接本机服务，请先运行 npm run start:api");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `本机服务请求失败：HTTP ${response.status}`);
  return body;
}

export function getLocalApiHealth() {
  return request("/health");
}

export async function parseResumeFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return request("/v1/resumes/parse", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, mimeType: file.type, dataBase64: btoa(binary) }),
  });
}

export function getProviderSettings() {
  return request("/v1/settings/provider");
}

export function saveProviderSettings(settings) {
  return request("/v1/settings/provider", { method: "PUT", body: JSON.stringify(settings) });
}

export function deleteProviderKey() {
  return request("/v1/settings/provider/key", { method: "DELETE" });
}

export function testProviderConnection() {
  return request("/v1/ai/test", { method: "POST", body: "{}" });
}

export function structureResumeWithAi(text) {
  return request("/v1/ai/resumes/structure", { method: "POST", body: JSON.stringify({ text }) });
}

export function analyzeJobWithAi(profile, job) {
  return request("/v1/ai/match", { method: "POST", body: JSON.stringify({ profile, job }) });
}

export function createApplicationPackageWithAi(profile, job, supplementalAnswers = []) {
  return request("/v1/ai/application-package", {
    method: "POST",
    body: JSON.stringify({ profile, job, supplementalAnswers }),
  });
}

export function searchJobsWithAi(profile, instructions) {
  return request("/v1/ai/search", { method: "POST", body: JSON.stringify({ profile, instructions }) });
}
