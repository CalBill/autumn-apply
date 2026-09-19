export function extractJobFromPage() {
  const visibleText = (element) => {
    if (!element) return "";
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return "";
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  };
  const firstText = (selectors, maxLength = 160) => {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = visibleText(element);
        if (text && text.length <= maxLength) return text;
      }
    }
    return "";
  };
  const longestText = (selectors) => {
    const candidates = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    return candidates
      .map(visibleText)
      .filter((text) => text.length >= 40)
      .sort((a, b) => b.length - a.length)[0] || "";
  };
  const meta = (property) => document.querySelector(`meta[property='${property}'], meta[name='${property}']`)?.content?.trim() || "";

  const title = firstText(["h1", "[class*='job-title']", "[class*='position-title']", "[data-testid*='title']"])
    || meta("og:title")
    || document.title.split(/[|_-]/)[0].trim();
  const company = firstText([
    "[data-company]", "[class*='company-name']", "[class*='companyName']", "[class*='company-title']",
    "[data-testid*='company']",
  ]);
  const jobLocation = firstText([
    "[class*='job-location']", "[class*='location']", "[data-testid*='location']", "[class*='address']",
  ], 80);
  const description = longestText([
    "[class*='job-detail']", "[class*='job-description']", "[class*='description']", "[class*='jobDetail']",
    "article", "main",
  ]) || visibleText(document.body);

  return {
    sourceUrl: globalThis.location.href,
    sourcePlatform: globalThis.location.hostname.replace(/^www\./, ""),
    title,
    company,
    location: jobLocation,
    description: description.slice(0, 40_000),
    capturedAt: new Date().toISOString(),
  };
}
