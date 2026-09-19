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

export function fillGenericForm(payload) {
  const normalize = (value) => String(value ?? "").toLocaleLowerCase().replace(/[\s:：()（）_\-\/]/g, "");
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const labelFor = (element) => {
    const parts = [element.getAttribute("aria-label"), element.getAttribute("placeholder"), element.name, element.id];
    if (element.id) parts.push(document.querySelector(`label[for='${CSS.escape(element.id)}']`)?.innerText);
    parts.push(element.closest("label")?.innerText);
    const parentText = element.parentElement?.innerText;
    if (parentText && parentText.length < 160) parts.push(parentText);
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  };
  const sensitive = (label) => payload.sensitiveLabels.some((value) => normalize(label).includes(normalize(value)));
  const match = (label) => {
    const normalized = normalize(label);
    if (!normalized || sensitive(label)) return null;
    const candidates = [];
    for (const definition of payload.catalog) {
      if ((definition.excludes ?? []).some((value) => normalized.includes(normalize(value)))) continue;
      for (const alias of definition.labels) {
        const normalizedAlias = normalize(alias);
        if (!normalizedAlias || !normalized.includes(normalizedAlias)) continue;
        candidates.push({ definition, score: (normalized === normalizedAlias ? 100 : 0) + normalizedAlias.length });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.definition ?? null;
  };
  const setNativeValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    for (const type of ["input", "change", "blur"]) element.dispatchEvent(new Event(type, { bubbles: true }));
  };
  const fillSelect = (element, value) => {
    const normalizedValue = normalize(value);
    const option = [...element.options].find((item) => {
      const text = normalize(item.textContent);
      const optionValue = normalize(item.value);
      return text === normalizedValue || optionValue === normalizedValue || text.includes(normalizedValue);
    });
    if (!option) return false;
    element.value = option.value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const mark = (element, state) => {
    element.dataset.autumnApplyStatus = state;
    element.style.outline = state === "filled" ? "2px solid #2f8a5b" : "2px solid #d98243";
    element.style.outlineOffset = "2px";
  };

  const report = { filled: [], skipped: [], review: [] };
  const controls = [...document.querySelectorAll("input, textarea, select, [contenteditable='true']")];
  for (const element of controls) {
    if (!visible(element) || element.disabled || element.readOnly) continue;
    const type = (element.getAttribute("type") || "text").toLowerCase();
    const label = labelFor(element);
    if (["hidden", "password", "submit", "button", "reset"].includes(type)) continue;
    if (["file", "checkbox", "radio"].includes(type)) {
      report.review.push({ label: label || type, reason: "需要人工处理" });
      mark(element, "review");
      continue;
    }
    if (sensitive(label)) {
      report.review.push({ label, reason: "敏感字段" });
      mark(element, "review");
      continue;
    }
    const definition = match(label);
    if (!definition) continue;
    const value = payload.values[definition.key];
    if (!value) {
      report.review.push({ label, key: definition.key, reason: "资料库缺少内容" });
      mark(element, "review");
      continue;
    }
    if (String(element.value ?? element.textContent ?? "").trim()) {
      report.skipped.push({ label, key: definition.key, reason: "已有内容" });
      continue;
    }

    let success = true;
    if (element instanceof HTMLSelectElement) success = fillSelect(element, value);
    else if (element.isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else setNativeValue(element, value);

    if (success) {
      report.filled.push({ label, key: definition.key });
      mark(element, "filled");
    } else {
      report.review.push({ label, key: definition.key, reason: "选项中没有匹配值" });
      mark(element, "review");
    }
  }
  return report;
}
