import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSemanticMatch, sanitizeProfileForModel, structureResumeWithAi } from "../src/ai-workflows.js";

test("model profile omits direct identity and contact fields", () => {
  const safe = sanitizeProfileForModel({
    personal: { fullName: "张三", email: "secret@example.com", phone: "13800138000" },
    education: [{ school: "清华大学", degree: "硕士" }], skills: ["合规"], preferences: { roles: ["合规"], locations: ["上海"], graduationYear: "2027" },
  });
  assert.equal(safe.personal, undefined);
  assert.equal(JSON.stringify(safe).includes("secret@example.com"), false);
});

test("semantic match passes a strict schema and returns disclosed fields", async () => {
  let options;
  const assessment = { score: 88, summary: "匹配", recommendation: "apply", hardRequirements: [], strengths: ["合规"], gaps: [], warnings: [] };
  const model = { generateStructured: async (value) => { options = value; return { data: assessment, responseId: "r1", usage: null }; } };
  const result = await analyzeSemanticMatch({
    profile: { education: [], experiences: [], projects: [], skills: ["合规"], preferences: {} },
    job: { title: "合规岗", company: "示例", description: "面向2027届毕业生招聘合规岗位" }, model,
  });
  assert.equal(options.schemaName, "job_match_assessment");
  assert.equal(options.schema.additionalProperties, false);
  assert.equal(result.assessment.score, 88);
  assert.ok(!result.disclosedFields.includes("personal"));
});

test("resume structuring explicitly forbids invented facts", async () => {
  let instructions;
  const model = { generateStructured: async (value) => { instructions = value.instructions; return { data: { personal: {}, education: [], experiences: [], projects: [], skills: [], preferences: {} } }; } };
  await structureResumeWithAi({ resumeText: "张三的真实简历内容足够长，包含清晰的教育经历、实习经历、项目经历、技能证书以及对应的起止时间。", model });
  assert.match(instructions, /不推测、不美化、不补全/);
});
