import assert from "node:assert/strict";
import test from "node:test";

import { discoverJobs, normalizeDiscoveryInstructions } from "./discovery.js";
import { normalizeProfile } from "./profile.js";

const profile = normalizeProfile({
  personal: { fullName: "测试用户", email: "test@example.com" },
  education: [{ school: "测试大学", degree: "本科", major: "统计学" }],
  skills: ["Python", "SQL", "数据分析"],
  preferences: { roles: ["数据分析"], locations: ["上海"], graduationYear: "2027", minimumScore: 60 },
});

test("discovery instructions combine explicit queries with profile preferences", () => {
  const instructions = normalizeDiscoveryInstructions({ queries: "商业分析", excludedKeywords: "高级、负责人" }, profile);
  assert.deepEqual(instructions.queries, ["商业分析", "数据分析"]);
  assert.deepEqual(instructions.locations, ["上海"]);
  assert.deepEqual(instructions.excludedKeywords, ["高级", "负责人"]);
});

test("discovery inherits durable candidate filters", () => {
  const profile = normalizeProfile({
    preferences: {
      roles: ["合规"], locations: ["上海"], industries: ["金融"], companyTypes: ["央企"],
      requiredKeywords: ["校招"], excludedKeywords: ["销售", "外包"], campusOnly: true,
    },
  });
  const instructions = normalizeDiscoveryInstructions({}, profile);
  assert.deepEqual(instructions.requiredKeywords, ["校招"]);
  assert.deepEqual(instructions.excludedKeywords, ["销售", "外包"]);
  assert.deepEqual(instructions.industries, ["金融"]);
  assert.equal(instructions.campusOnly, true);
});

test("discovery filters, enriches and ranks real job shapes", async () => {
  const provider = {
    id: "fixture",
    name: "合成岗位源",
    search: async () => ({
      total: 3,
      jobs: [
        { id: "1", providerId: "1", title: "数据分析实习生", company: "甲公司", location: "上海", publishedAt: null },
        { id: "2", providerId: "2", title: "高级数据分析负责人", company: "乙公司", location: "上海", publishedAt: null },
        { id: "3", providerId: "3", title: "数据分析实习生", company: "丙公司", location: "北京", publishedAt: null },
      ],
    }),
    detail: async (job) => ({
      ...job,
      sourceUrl: `https://example.com/${job.id}`,
      sourcePlatform: "合成岗位源",
      description: "面向2027届，本科及以上，要求熟悉 Python、SQL 和数据分析。",
    }),
  };

  const output = await discoverJobs({
    profile,
    instructions: { queries: "数据分析", locations: "上海", excludedKeywords: "高级、负责人", maxResults: 10 },
    providers: [provider],
  });

  assert.equal(output.results.length, 1);
  assert.equal(output.results[0].job.id, "1");
  assert.ok(output.results[0].assessment.score >= 80);
});

test("batch providers receive the full WeChat search context once", async () => {
  const calls = [];
  const provider = {
    id: "wechat-fixture",
    name: "微信公众号",
    batchSearch: true,
    search: async (input) => {
      calls.push(input);
      return { jobs: [], warnings: ["部分查询受到临时限制"] };
    },
    detail: async (job) => job,
  };
  const output = await discoverJobs({
    profile,
    instructions: { queries: "数据分析、商业分析", locations: "上海、北京", wechatKeywords: "国资小新" },
    providers: [provider],
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].queries, ["数据分析", "商业分析"]);
  assert.deepEqual(calls[0].locations, ["上海", "北京"]);
  assert.deepEqual(calls[0].focusKeywords, ["国资小新"]);
  assert.match(output.errors[0], /临时限制/);
});

test("high-quality WeChat clues remain visible when the excerpt only signals the searched role", async () => {
  const provider = {
    id: "wechat-fixture",
    name: "微信公众号",
    batchSearch: true,
    search: async () => ({
      jobs: [{
        id: "wechat-1",
        providerId: "wechat-1",
        title: "某集团2027届校园招聘正式启动",
        company: "某集团",
        location: "上海",
        description: "面向2027届毕业生开放网申，具体岗位请查看原文。",
        sourceUrl: "https://weixin.sogou.com/link?url=test",
        sourcePlatform: "微信公众号 · 搜狗微信",
        sourceType: "wechat-article",
        sourceVerified: false,
        metadata: { qualityScore: 85, matchedQueries: ["数据分析 2027届 校招"], articleType: "company-announcement" },
      }],
      searchedQueries: ["数据分析 2027届 校招"],
      searchPlan: ["数据分析 2027届 校招"],
    }),
    detail: async (job) => job,
  };
  const output = await discoverJobs({ profile, instructions: { queries: "数据分析", minimumScore: 60 }, providers: [provider] });
  assert.equal(output.results.length, 1);
  assert.match(output.results[0].assessment.strengths.join(" "), /公众号检索词命中/);
  assert.equal(output.sourceStats[0].searchedQueries, 1);
});
