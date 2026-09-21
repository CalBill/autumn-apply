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

test("OpenAI AI web search verifies cited results", async () => {
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
  await assert.rejects(() => searchJobsWithAi({ profile: {}, model, provider: "deepseek" }), /OpenAI 或智谱/);
});

test("Zhipu web search keeps only returned links and applies local matching", async () => {
  let calls = 0;
  const queries = [];
  const model = {
    searchWeb: async (query) => {
      calls += 1;
      queries.push(query);
      return { raw: {
      choices: [{ message: { tool_calls: [{ search_result: [{
        title: "某集团2027届合规管培生校园招聘", content: "工作地点上海，面向2027届毕业生。", refer: "https://example.com/job", media_name: "某集团", publish_date: "2026-09-20",
      }] }] } }],
      } };
    },
  };
  const result = await searchJobsWithAi({
    profile: { education: [], experiences: [], projects: [], skills: [], qualifications: {}, preferences: { roles: ["合规"], locations: ["上海"], graduationYear: "2027", excludedKeywords: [] } },
    instructions: { roles: ["合规"], locations: ["上海"], maximumResults: 5 },
    model, provider: "zhipu", resolveHost: publicDns,
    fetchImpl: async () => new Response("某集团2027届合规管培生校园招聘", { status: 200, headers: { "Content-Type": "text/html" } }),
  });
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].company, "某集团");
  assert.equal(result.opportunities[0].location, "上海");
  assert.equal(result.opportunities[0].verification.status, "verified");
  assert.equal(calls, 2);
  assert.deepEqual(queries, ["2027届 校园招聘 合规 上海 官方招聘 网申", "2027届 秋招 上海 合规 国企 央企 金融 官方招聘"]);
  assert.deepEqual(result.searchStats, { provider: "zhipu", queries: 2, returned: 2, candidates: 1, rejected: 0, displayed: 1 });
});

test("Zhipu web search recovers official links embedded in current result excerpts", async () => {
  const model = {
    searchWeb: async () => ({ raw: {
      choices: [{ message: { tool_calls: [{ search_result: [{
        title: "某券商 2027 校园招聘", media_name: "某券商", refer: "ref_1",
        content: "上海岗位，官方投递链接 https://example.com/campus/apply?job=2027。",
      }] }] } }],
    } }),
  };
  const result = await searchJobsWithAi({
    profile: { education: [], experiences: [], projects: [], skills: [], qualifications: {}, preferences: { roles: ["金融"], locations: ["上海"], graduationYear: "2027", excludedKeywords: [] } },
    instructions: { roles: ["金融"], locations: ["上海"], maximumResults: 5 },
    model, provider: "zhipu", resolveHost: publicDns,
    fetchImpl: async () => new Response("某券商 2027 校园招聘", { status: 200, headers: { "Content-Type": "text/html" } }),
  });
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].sourceUrl, "https://example.com/campus/apply?job=2027");
  assert.deepEqual(result.searchStats, { provider: "zhipu", queries: 2, returned: 2, candidates: 1, rejected: 0, displayed: 1 });
});

test("Zhipu web search removes clear graduation, city and experience mismatches before display", async () => {
  const model = {
    searchWeb: async () => ({ raw: {
      choices: [{ message: { tool_calls: [{ search_result: [
        { title: "2026届广州销售培训生", content: "面向2026届，广州工作，要求3年以上全职经验。https://example.com/mismatch", refer: "ref_1" },
        { title: "2027届上海金融管培生", content: "面向2027届，上海工作。https://example.com/match", refer: "ref_2" },
      ] }] } }],
    } }),
  };
  const result = await searchJobsWithAi({
    profile: { education: [{ degree: "本科" }], experiences: [], projects: [], skills: [], qualifications: {}, preferences: { roles: ["金融"], locations: ["上海"], graduationYear: "2027", experienceYears: 0, excludedKeywords: ["销售"] } },
    instructions: { roles: ["金融"], locations: ["上海"], excludedKeywords: ["销售"], maximumResults: 5 },
    model, provider: "zhipu", resolveHost: publicDns,
    fetchImpl: async () => new Response("2027届上海金融管培生", { status: 200, headers: { "Content-Type": "text/html" } }),
  });
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].sourceUrl, "https://example.com/match");
  assert.equal(result.searchStats.rejected, 1);
});
