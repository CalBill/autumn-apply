import assert from "node:assert/strict";
import test from "node:test";

import { analyzeJob } from "./matcher.js";
import { normalizeProfile } from "./profile.js";
import { createResumeVariant } from "./resume.js";

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
