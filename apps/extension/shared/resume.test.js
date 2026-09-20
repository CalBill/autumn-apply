import assert from "node:assert/strict";
import test from "node:test";

import { analyzeJob } from "./matcher.js";
import { normalizeProfile } from "./profile.js";
import { createAiResumeVariant, createResumeVariant } from "./resume.js";

test("resume variant prioritizes relevant facts without inventing bullets", () => {
  const profile = normalizeProfile({
    personal: { fullName: "测试用户", email: "test@example.com" },
    education: [{ school: "测试大学", degree: "本科", major: "统计学" }],
    skills: ["Python", "SQL"],
    experiences: [
      { title: "内容运营", organization: "甲公司", highlights: ["撰写活动文案"], keywords: ["写作"] },
      { title: "数据实习生", organization: "乙公司", highlights: ["使用 Python 和 SQL 清洗销售数据"], keywords: ["Python", "SQL"] },
    ],
    preferences: { roles: ["数据分析"] },
  });
  const assessment = analyzeJob({
    title: "数据分析师",
    company: "目标公司",
    description: "使用 Python 和 SQL 开展数据分析工作。",
  }, profile);
  const variant = createResumeVariant(profile, assessment);

  assert.equal(variant.sections.experiences[0].organization, "乙公司");
  assert.ok(variant.markdown.includes("使用 Python 和 SQL 清洗销售数据"));
  assert.equal(variant.markdown.includes("提升30%"), false);
  assert.equal(variant.sections.experiences[0].bullets[0].sourceId, profile.experiences[1].id);
});

test("AI resume variants only rewrite stories with existing source ids", () => {
  const profile = normalizeProfile({
    personal: { fullName: "测试用户", email: "test@example.com" },
    education: [{ school: "测试大学", degree: "本科", major: "法学" }],
    experiences: [{ id: "experience-1", title: "合规实习生", organization: "甲公司", highlights: ["整理合同台账"], keywords: ["合规"] }],
    skills: ["合规"], preferences: { roles: ["合规"] },
  });
  const assessment = analyzeJob({ title: "合规岗", company: "目标公司", description: "负责合同合规审查" }, profile);
  const variant = createAiResumeVariant(profile, assessment, {
    summary: "突出合规", experiences: [{ sourceId: "experience-1", bullets: ["维护并核验合同台账"], rationale: "匹配职责" }],
    projects: [], warnings: [],
  });
  assert.match(variant.markdown, /维护并核验合同台账/);
  assert.equal(variant.sections.experiences[0].bullets[0].requiresReview, true);
});
