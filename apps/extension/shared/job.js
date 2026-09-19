function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeJob(input = {}) {
  const sourceUrl = cleanText(input.sourceUrl);
  let sourcePlatform = cleanText(input.sourcePlatform);
  if (!sourcePlatform && sourceUrl) {
    try {
      sourcePlatform = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      sourcePlatform = "unknown";
    }
  }

  return {
    id: cleanText(input.id) || `job-${simpleHash(`${sourceUrl}|${input.title}|${input.company}`)}`,
    sourceUrl,
    sourcePlatform: sourcePlatform || "unknown",
    title: cleanText(input.title) || "未识别岗位",
    company: cleanText(input.company) || "未识别公司",
    location: cleanText(input.location),
    description: cleanText(input.description).slice(0, 40_000),
    capturedAt: cleanText(input.capturedAt) || new Date().toISOString(),
  };
}

export function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
