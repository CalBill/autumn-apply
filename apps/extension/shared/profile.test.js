import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyProfile, normalizeProfile, splitList, validateProfile } from "./profile.js";

test("splitList accepts Chinese punctuation and removes blanks", () => {
  assert.deepEqual(splitList("Python，SQL; 数据分析\nGit"), ["Python", "SQL", "数据分析", "Git"]);
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

test("validateProfile reports the minimum required data", () => {
  assert.deepEqual(validateProfile(createEmptyProfile()), [
    "请填写姓名",
    "邮箱和手机号至少填写一项",
    "请至少填写一段教育经历",
    "请至少填写一项技能",
  ]);
});
