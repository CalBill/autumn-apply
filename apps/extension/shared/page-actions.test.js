import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseHTML } from "linkedom";

import { buildAutofillPayload, SENSITIVE_LABELS } from "./form-mapping.js";
import { fillGenericForm, restoreAutofill, reviewSubmissionPage } from "./page-actions.js";
import { normalizeProfile } from "./profile.js";

const fixtureUrl = new URL("../test-fixtures/generic-job-form.html", import.meta.url);

async function withFixture(run) {
  const html = await readFile(fixtureUrl, "utf8");
  const { document, window } = parseHTML(html);
  const previous = new Map();
  const globals = {
    document,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    CSS: window.CSS ?? { escape: (value) => String(value).replace(/['\\]/g, "\\$&") },
    Event: window.Event,
    InputEvent: window.InputEvent ?? window.Event,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
  };
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, globalThis[name]);
    globalThis[name] = value;
  }
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  const originalSelectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value");
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 120, height: 30 });
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
    configurable: true,
    get() { return this.dataset.testValue ?? ""; },
    set(value) { this.dataset.testValue = String(value ?? ""); },
  });
  try {
    return await run({ document, window });
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    if (originalSelectValue) Object.defineProperty(window.HTMLSelectElement.prototype, "value", originalSelectValue);
    else delete window.HTMLSelectElement.prototype.value;
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
}

const profile = normalizeProfile({
  personal: { fullName: "测试用户", email: "test@example.com", phone: "13800138000" },
  education: [{ school: "测试大学", degree: "本科", major: "统计学" }],
  skills: ["Python", "SQL"],
  preferences: { graduationYear: "2027" },
});

test("generic autofill fills known fields, preserves existing values and flags sensitive fields", async () => {
  await withFixture(({ document }) => {
    const report = fillGenericForm({ ...buildAutofillPayload(profile), sensitiveLabels: SENSITIVE_LABELS });

    assert.equal(document.querySelector("[name='candidateName']").value, "测试用户");
    assert.equal(document.querySelector("[name='email']").value, "test@example.com");
    assert.equal(document.querySelector("[name='degree']").value, "本科");
    assert.equal(document.querySelector("[name='referral']").value, "SYNTHETIC-REFERRAL");
    assert.ok(report.filled.some((item) => item.key === "fullName"));
    assert.ok(report.review.some((item) => item.label.includes("身份证") && item.reason === "敏感字段"));
    assert.ok(report.review.some((item) => item.reason === "需要人工处理"));
  });
});

test("autofill snapshots can be restored without overwriting later user edits", async () => {
  await withFixture(({ document }) => {
    const report = fillGenericForm({ ...buildAutofillPayload(profile), sensitiveLabels: SENSITIVE_LABELS });
    const phone = document.querySelector("[name='mobile']");
    phone.value = "13900000000";

    const restored = restoreAutofill(report.snapshot);

    assert.equal(document.querySelector("[name='candidateName']").value, "");
    assert.equal(phone.value, "13900000000");
    assert.ok(restored.skipped.some((item) => item.reason === "用户已经修改，未撤销"));
  });
});

test("submission review blocks unresolved sensitive and manual fields", async () => {
  await withFixture(() => {
    fillGenericForm({ ...buildAutofillPayload(profile), sensitiveLabels: SENSITIVE_LABELS });
    const result = reviewSubmissionPage({ submit: false });

    assert.equal(result.ready, false);
    assert.equal(result.clicked, false);
    assert.match(result.submitText, /最终提交/);
    assert.ok(result.blockers.some((item) => item.includes("身份证")));
    assert.ok(result.blockers.some((item) => item.includes("上传简历")));
  });
});
