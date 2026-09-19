import assert from "node:assert/strict";
import test from "node:test";

import { buildAutofillPayload, isSensitiveLabel, matchFieldDefinition } from "./form-mapping.js";
import { normalizeProfile } from "./profile.js";

test("field matching prefers precise labels and excludes company names", () => {
  assert.equal(matchFieldDefinition("手机号码（必填）")?.key, "phone");
  assert.equal(matchFieldDefinition("候选人姓名")?.key, "fullName");
  assert.equal(matchFieldDefinition("公司名称"), null);
});

test("sensitive identity and verification fields are blocked", () => {
  assert.equal(isSensitiveLabel("身份证号码"), true);
  assert.equal(isSensitiveLabel("短信验证码"), true);
  assert.equal(matchFieldDefinition("身份证号码"), null);
});

test("autofill payload contains confirmed profile facts and common answers", () => {
  const profile = normalizeProfile({
    personal: { fullName: "测试用户", email: "test@example.com" },
    education: [{ school: "测试大学", degree: "本科" }],
    skills: ["Python"],
    commonAnswers: [{ id: "why", question: "为什么申请本岗位", answer: "与我的数据项目方向一致。" }],
  });
  const payload = buildAutofillPayload(profile);

  assert.equal(payload.values.school, "测试大学");
  assert.equal(payload.values["answer:why"], "与我的数据项目方向一致。");
  assert.ok(payload.catalog.some((item) => item.key === "answer:why"));
});
