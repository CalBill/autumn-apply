import assert from "node:assert/strict";
import test from "node:test";

import { createAiDiscoveryOutput, mergeDiscoveryOutputs } from "./discovery-output.js";

const instructions = { queries: ["合规"], locations: ["上海"], minimumScore: 60 };

test("AI opportunities use the same discovery result contract", () => {
  const output = createAiDiscoveryOutput({
    searchedAt: "2026-09-20T00:00:00.000Z",
    opportunities: [{
      id: "ai-1", title: "合规管培生", company: "测试公司", location: "上海",
      description: "2027届校园招聘", sourceUrl: "https://example.com/1", publishedAt: "2026-09-19",
      matchScore: 82, matchReason: "方向匹配", hardRequirementRisk: "需要确认英语六级",
      verification: { status: "verified" },
    }],
  }, instructions);

  assert.equal(output.instructions, instructions);
  assert.equal(output.results[0].job.sourceType, "ai-web-search");
  assert.equal(output.results[0].assessment.job, output.results[0].job);
  assert.equal(output.results[0].assessment.hardRequirementsMet, true);
  assert.equal(output.results[0].assessment.passedThreshold, true);
});

test("AI supplements merge with saved non-AI discovery results", () => {
  const existing = {
    instructions,
    results: [{ job: { id: "official-1" }, assessment: { score: 70 } }],
    sourceStats: [{ id: "official", name: "企业官网", fetched: 1 }],
    errors: ["官网部分失败"],
    searchedAt: "2026-09-19T00:00:00.000Z",
  };
  const ai = createAiDiscoveryOutput({
    searchedAt: "2026-09-20T00:00:00.000Z",
    opportunities: [{
      id: "ai-1", title: "合规管培生", company: "测试公司", location: "上海", description: "校招",
      sourceUrl: "https://example.com/1", matchScore: 82, matchReason: "方向匹配", hardRequirementRisk: "",
      verification: { status: "verified" },
    }],
  }, instructions);

  const merged = mergeDiscoveryOutputs(existing, ai);

  assert.deepEqual(merged.results.map((entry) => entry.job.id), ["ai-1", "official-1"]);
  assert.deepEqual(merged.sourceStats.map((source) => source.id), ["official", "ai-web-search"]);
  assert.deepEqual(merged.errors, ["官网部分失败"]);
  assert.equal(merged.searchedAt, ai.searchedAt);
});
