import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyProfile, normalizeProfile, profileReadiness, splitList, validateProfile } from "./profile.js";

test("splitList accepts Chinese punctuation and removes blanks", () => {
  assert.deepEqual(splitList("Python，SQL; 数据分析、Git"), ["Python", "SQL", "数据分析", "Git"]);
});

test("normalizeProfile removes unknown fields and normalizes arrays", () => {
  const profile = normalizeProfile({
    unexpectedSecret: "must not survive",
    personal: { fullName: "  小秋  ", email: "x@example.com" },
    education: [{ school: "A 大学", degree: "本科" }],
    skills: "Python, SQL",
    preferences: { minimumScore: 140 },
  });

  assert.equal(profile.personal.fullName, "小秋");
  assert.deepEqual(profile.skills, ["Python", "SQL"]);
  assert.equal(profile.preferences.minimumScore, 100);
  assert.equal("unexpectedSecret" in profile, false);
});

test("normalizeProfile preserves job preferences and qualifications", () => {
  const profile = normalizeProfile({
    qualifications: { politicalStatus: "中共党员", certificates: "英语六级、基金从业", languages: ["英语"] },
    preferences: {
      industries: "金融、航运", companyTypes: "央企、国企", requiredKeywords: "校招",
      excludedKeywords: "销售、外包", campusOnly: false,
    },
  });

  assert.deepEqual(profile.qualifications.certificates, ["英语六级", "基金从业"]);
  assert.deepEqual(profile.preferences.industries, ["金融", "航运"]);
  assert.deepEqual(profile.preferences.excludedKeywords, ["销售", "外包"]);
  assert.equal(profile.preferences.campusOnly, false);
});

test("validateProfile reports the minimum required data", () => {
  assert.deepEqual(validateProfile(createEmptyProfile()), [
    "请填写姓名",
    "邮箱和手机号至少填写一项",
    "请至少填写一段教育经历",
    "请至少填写一项技能",
  ]);
});

test("profile readiness explains onboarding gaps", () => {
  const profile = normalizeProfile({
    personal: { fullName: "小秋", email: "x@example.com" },
    education: [{ school: "测试大学" }], skills: ["Excel"],
    preferences: { roles: ["管培生"], locations: ["上海"], graduationYear: "2027" },
  });
  const readiness = profileReadiness(profile);
  assert.ok(readiness.score > 50);
  assert.ok(readiness.missing.includes("实习或项目经历"));
  assert.ok(readiness.missing.includes("行业、企业性质或排除条件"));
});
