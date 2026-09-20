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

  const report = { filled: [], skipped: [], review: [], snapshot: [] };
  const controls = [...document.querySelectorAll("input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']")];
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
    if (element.getAttribute("role") === "combobox") {
      report.review.push({ label, reason: "自定义下拉框需要人工选择" });
      mark(element, "review");
      continue;
    }
    if (element.getAttribute("role") === "textbox" && !(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement) && !element.isContentEditable) {
      report.review.push({ label, reason: "自定义文本控件需要人工填写" });
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

    const token = element.dataset.autumnApplyToken || `aa-${Date.now()}-${report.filled.length}-${Math.random().toString(16).slice(2)}`;
    element.dataset.autumnApplyToken = token;
    const previousValue = element.isContentEditable ? element.textContent : element.value;
    let success = true;
    if (element instanceof HTMLSelectElement) success = fillSelect(element, value);
    else if (element.isContentEditable) {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else setNativeValue(element, value);

    if (success) {
      report.filled.push({ label, key: definition.key });
      const filledValue = element.isContentEditable ? element.textContent : element.value;
      report.snapshot.push({ token, previousValue: String(previousValue ?? ""), filledValue: String(filledValue ?? "") });
      mark(element, "filled");
    } else {
      report.review.push({ label, key: definition.key, reason: "选项中没有匹配值" });
      mark(element, "review");
    }
  }
  return report;
}

export function restoreAutofill(snapshot = []) {
  const setNativeValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    for (const type of ["input", "change", "blur"]) element.dispatchEvent(new Event(type, { bubbles: true }));
  };
  const report = { restored: [], skipped: [] };
  for (const item of snapshot) {
    const element = document.querySelector(`[data-autumn-apply-token='${CSS.escape(String(item.token))}']`);
    if (!element) { report.skipped.push({ token: item.token, reason: "字段已不存在" }); continue; }
    const currentValue = element.isContentEditable ? element.textContent : element.value;
    if (String(currentValue ?? "") !== String(item.filledValue ?? "")) {
      report.skipped.push({ token: item.token, reason: "用户已经修改，未撤销" });
      continue;
    }
    if (element.isContentEditable) {
      element.textContent = item.previousValue;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element instanceof HTMLSelectElement) {
      element.value = item.previousValue;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else setNativeValue(element, item.previousValue);
    element.style.outline = "";
    element.style.outlineOffset = "";
    delete element.dataset.autumnApplyStatus;
    report.restored.push({ token: item.token });
  }
  return report;
}

export function reviewSubmissionPage(options = {}) {
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const labelFor = (element) => {
    const values = [element.getAttribute("aria-label"), element.getAttribute("placeholder"), element.name, element.id];
    if (element.id) values.push(document.querySelector(`label[for='${CSS.escape(element.id)}']`)?.innerText);
    values.push(element.closest("label")?.innerText);
    return normalize(values.filter(Boolean).join(" ")) || "未命名字段";
  };
  const hasValue = (element) => {
    const type = (element.getAttribute("type") || "").toLowerCase();
    if (["checkbox", "radio"].includes(type)) return element.checked;
    if (type === "file") return Boolean(element.files?.length);
    if (element.isContentEditable) return Boolean(normalize(element.textContent));
    return Boolean(normalize(element.value));
  };
  const forms = [...document.querySelectorAll("form")].filter(visible);
  const rankedForms = forms.map((form) => ({
    form,
    controls: [...form.querySelectorAll("input, textarea, select, [contenteditable='true']")].filter(visible),
  })).sort((a, b) => b.controls.length - a.controls.length);
  const candidate = rankedForms[0];
  const blockers = [];
  const warnings = [];
  if (!candidate || candidate.controls.length < 2) blockers.push("没有识别到可提交的申请表单");

  const controls = candidate?.controls ?? [];
  for (const element of controls) {
    const type = (element.getAttribute("type") || "").toLowerCase();
    if (["hidden", "submit", "button", "reset"].includes(type) || element.disabled) continue;
    const required = element.required || element.getAttribute("aria-required") === "true";
    if (required && !hasValue(element)) blockers.push(`必填项尚未完成：${labelFor(element)}`);
    if (element.dataset.autumnApplyStatus === "review" && !hasValue(element)) blockers.push(`仍需人工处理：${labelFor(element)}`);
    if (element.dataset.autumnApplyStatus === "review" && hasValue(element)) warnings.push(`请再次确认：${labelFor(element)}`);
  }

  const captcha = document.querySelector("iframe[src*='captcha' i], iframe[src*='recaptcha' i], [class*='captcha' i], [id*='captcha' i], [class*='verify-code' i], [id*='verify-code' i]");
  if (captcha && visible(captcha)) blockers.push("页面存在验证码或人机验证，必须由用户处理");
  if (controls.some((element) => (element.getAttribute("type") || "").toLowerCase() === "password")) blockers.push("页面包含密码字段，不允许自动提交");

  const submitCandidates = candidate ? [...candidate.form.querySelectorAll("button, input[type='submit']")]
    .filter(visible)
    .filter((element) => {
      const text = normalize(element.innerText || element.value || element.getAttribute("aria-label"));
      return /^(最终提交|提交申请|确认提交|提交|立即申请|申请职位|submit application|submit)(?:\b|（|\(|$)/i.test(text);
    }) : [];
  if (submitCandidates.length === 0) blockers.push("没有识别到唯一的最终提交按钮");
  if (submitCandidates.length > 1) blockers.push("识别到多个可能的提交按钮，需要用户选择");
  const submitButton = submitCandidates.length === 1 ? submitCandidates[0] : null;
  const submitText = normalize(submitButton?.innerText || submitButton?.value || submitButton?.getAttribute("aria-label"));
  const ready = blockers.length === 0;
  let clicked = false;
  if (options.submit === true && ready) {
    if (options.expectedText && normalize(options.expectedText) !== submitText) {
      blockers.push("最终提交按钮在确认后发生变化，已停止提交");
    } else {
      submitButton.click();
      clicked = true;
    }
  }
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], submitText, clicked };
}
