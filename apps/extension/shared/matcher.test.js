import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProfile } from "./profile.js";
import { analyzeJob } from "./matcher.js";

const profile = normalizeProfile({
  personal: { fullName: "测试用户", email: "test@example.com" },
  education: [{ school: "测试大学", degree: "本科", major: "信息管理" }],
  skills: ["Python", "SQL", "数据分析"],
  preferences: { roles: ["数据分析"], locations: ["上海"], graduationYear: "2027", minimumScore: 60 },
});

test("analyzeJob explains matching skills and hard requirements", () => {
  const result = analyzeJob({
    title: "数据分析实习生",
    company: "示例公司",
    location: "上海",
    description: "面向2027届，本科及以上学历。要求熟悉 Python、SQL 和数据分析，掌握 Tableau 优先。",
  }, profile);

  assert.equal(result.hardRequirementsMet, true);
  assert.ok(result.score >= 80);
  assert.deepEqual(result.matchedSkills, ["Python", "SQL", "数据分析"]);
  assert.ok(result.missingSkills.includes("Tableau"));
  assert.ok(result.strengths.some((item) => item.includes("毕业年份")));
});

test("hard graduation mismatch caps the score", () => {
  const result = analyzeJob({
    title: "数据分析",
    description: "仅面向2026届，本科及以上，要求 Python、SQL、数据分析。",
  }, profile);

  assert.equal(result.hardRequirementsMet, false);
  assert.ok(result.score <= 49);
  assert.ok(result.gaps.some((item) => item.includes("2026")));
});

test("required full-time experience is treated as a hard condition", () => {
  const result = analyzeJob({
    title: "高级数据分析师",
    description: "本科及以上学历，要求3年以上互联网数据分析经验，熟悉 Python 和 SQL。",
  }, profile);

  assert.equal(result.hardRequirementsMet, false);
  assert.ok(result.score <= 49);
  assert.ok(result.gaps.some((item) => item.includes("3 年")));
});

test("non-AI matching uses industry, company type and verified qualifications", () => {
  const profile = normalizeProfile({
    personal: { fullName: "测试", email: "test@example.com" },
    education: [{ school: "测试大学", degree: "硕士" }], skills: ["合规"],
    qualifications: { politicalStatus: "中共党员", languages: ["英语六级"] },
    preferences: { roles: ["合规"], industries: ["金融"], companyTypes: ["央企"] },
  });
  const result = analyzeJob({
    title: "合规岗", company: "某金融央企", location: "北京",
    description: "要求中共党员，要求英语六级，负责合规管理。",
  }, profile);
  assert.ok(result.strengths.some((item) => item.includes("行业偏好")));
  assert.ok(result.strengths.some((item) => item.includes("企业性质")));
  assert.ok(result.strengths.some((item) => item.includes("党员")));
  assert.equal(result.hardRequirementsMet, true);
});

test("missing mandatory qualification caps the non-AI score", () => {
  const profile = normalizeProfile({
    personal: { fullName: "测试", email: "test@example.com" },
    education: [{ school: "测试大学", degree: "硕士" }], skills: ["合规"],
    qualifications: { politicalStatus: "群众", certificates: [] }, preferences: { roles: ["合规"] },
  });
  const result = analyzeJob({ title: "法律合规岗", company: "示例", description: "必须持有法律职业资格A证。" }, profile);
  assert.equal(result.hardRequirementsMet, false);
  assert.ok(result.score <= 49);
});
