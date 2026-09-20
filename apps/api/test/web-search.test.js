import assert from "node:assert/strict";
import test from "node:test";
import { searchJobsWithAi, validatePublicUrl, verifyOpportunity } from "../src/web-search.js";

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

test("URL verifier blocks local and private network targets", async () => {
  await assert.rejects(() => validatePublicUrl("http://example.com/job", publicDns), /HTTPS/);
  await assert.rejects(() => validatePublicUrl("https://localhost/job", publicDns), /本机/);
  await assert.rejects(() => validatePublicUrl("https://example.com/job", async () => [{ address: "127.0.0.1", family: 4 }]), /非公网/);
});

test("opportunity verifier checks page evidence", async () => {
  const result = await verifyOpportunity({ company: "示例公司", title: "合规岗", sourceUrl: "https://example.com/job" }, {
    resolveHost: publicDns,
    fetchImpl: async () => new Response("<html>示例公司 2027校园招聘 合规岗</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
  });
  assert.equal(result.status, "verified");
  assert.equal(result.signalsMatched, true);
});

test("AI web search requires OpenAI and verifies cited results", async () => {
  const opportunity = {
    company: "示例公司", title: "合规岗", location: "上海", description: "2027届", sourceUrl: "https://example.com/job",
    sourceTitle: "官方招聘", publishedAt: "2026-09-01", deadline: "2026-10-01", matchScore: 90, matchReason: "经历匹配", hardRequirementRisk: "",
  };
  const model = { generateStructured: async () => ({
    data: { opportunities: [opportunity] },
    raw: { output: [{ type: "web_search_call", action: { sources: [{ type: "url", url: "https://example.com/job" }] } }] },
  }) };
  const result = await searchJobsWithAi({
    profile: { education: [], experiences: [], projects: [], skills: [], preferences: { roles: ["合规"], locations: ["上海"], graduationYear: "2027" } },
    model, provider: "openai", resolveHost: publicDns,
    fetchImpl: async () => new Response("示例公司 合规岗", { status: 200, headers: { "Content-Type": "text/html" } }),
  });
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].verification.status, "verified");
  await assert.rejects(() => searchJobsWithAi({ profile: {}, model, provider: "deepseek" }), /仅OpenAI/);
});
