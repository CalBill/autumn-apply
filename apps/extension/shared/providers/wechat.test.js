import assert from "node:assert/strict";
import test from "node:test";

import { buildWechatSearchPlan, isRecruitmentArticle, parseSogouWechatArticles, searchWechatArticles } from "./wechat.js";

const fixture = `
  <ul class="news-list">
    <li>
      <div class="txt-box">
        <h3><a href="/link?url=abc">某集团2027届秋季校园招聘正式启动</a></h3>
        <p class="txt-info">面向2027届毕业生，北京、上海均有数据分析岗位，投递截止时间2026年10月31日，点击进入官方网申。</p>
        <div><span class="all-time-y2">某集团招聘</span><span class="s2"><script>timeConvert('1789747200')</script></span></div>
      </div>
    </li>
    <li><h3><a href="/link?url=ad">限时福利免费领取</a></h3><p class="txt-info">广告投放</p></li>
  </ul>`;

test("recognizes recruiting content and rejects promotional noise", () => {
  assert.equal(isRecruitmentArticle("2027届校园招聘", "开放网申"), true);
  assert.equal(isRecruitmentArticle("限时福利免费领取", "招聘资料"), false);
  assert.equal(isRecruitmentArticle("公司新闻", "季度业绩"), false);
  assert.equal(isRecruitmentArticle("2027届数据分析师必备技能清单", "结合校招 JD 拆解"), false);
});

test("parses WeChat recruitment articles into opportunity records", () => {
  const articles = parseSogouWechatArticles(fixture, "数据分析");
  assert.equal(articles.length, 1);
  assert.equal(articles[0].company, "某集团");
  assert.equal(articles[0].location, "北京/上海");
  assert.equal(articles[0].deadline, "2026-10-31");
  assert.equal(articles[0].metadata.articleType, "company-announcement");
  assert.ok(articles[0].metadata.qualityScore >= 80);
  assert.equal(articles[0].sourceType, "wechat-article");
  assert.equal(articles[0].sourceVerified, false);
  assert.match(articles[0].sourceUrl, /^https:\/\/weixin\.sogou\.com\/link/);
  assert.match(articles[0].metadata.fallbackSearchUrl, /weixin\?type=2/);
});

test("builds a bounded multi-angle search plan", () => {
  const plan = buildWechatSearchPlan({
    queries: ["管培生", "合规", "人力资源"],
    graduationYear: "2027",
    locations: ["上海", "北京"],
    industries: ["金融"],
    companyTypes: ["央企"],
    focusKeywords: ["国资小新", "中石油招聘"],
    maxRequests: 6,
  });
  assert.equal(plan.length, 6);
  assert.equal(plan[0], "管培生 2027届 校招");
  assert.ok(plan.includes("国资小新 2027届 招聘"));
});

test("WeChat plans include generic campus queries when an exact cohort is sparse", () => {
  const plan = buildWechatSearchPlan({ queries: ["金融"], graduationYear: "2027" });
  assert.ok(plan.includes("金融 2027届 校招"));
  assert.ok(plan.includes("金融 校园招聘"));
  assert.ok(plan.includes("金融 秋招"));
  assert.ok(plan.length <= 10);
});

test("WeChat plans seed recruitment-channel terms from industry and company preferences", () => {
  const plan = buildWechatSearchPlan({
    queries: ["合规"], graduationYear: "2027", industries: ["金融"], companyTypes: ["央企"], maxRequests: 10,
  });
  assert.ok(plan.includes("银行招聘 2027届 招聘"));
  assert.ok(plan.includes("国资小新 2027届 招聘"));
});

test("adds a recruitment signal to generic user queries", async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    return { ok: true, status: 200, url, text: async () => fixture };
  };
  const output = await searchWechatArticles({ query: "数据分析", graduationYear: "2027", pageSize: 10 }, fetchImpl);
  assert.match(decodeURIComponent(requestedUrls[0]), /query=数据分析\+2027届\+校招/);
  assert.equal(output.jobs.length, 1);
  assert.ok(output.searchPlan.includes("数据分析 校园招聘"));
  assert.equal(output.manualSearchUrls[0].query, "数据分析 2027届 校招");
  assert.match(output.manualSearchUrls[0].url, /weixin\?type=2/);
});

test("deduplicates reposted articles across planned queries", async () => {
  let requests = 0;
  const fetchImpl = async (url) => {
    requests += 1;
    const accountFixture = requests === 2 ? fixture.replace("某集团招聘", "高校就业中心") : fixture;
    return { ok: true, status: 200, url, text: async () => accountFixture };
  };
  const output = await searchWechatArticles({
    queries: ["合规"], graduationYear: "2027", locations: ["上海"], focusKeywords: ["央企招聘"], pageSize: 20,
  }, fetchImpl);
  assert.equal(requests, 10);
  assert.equal(output.jobs.length, 1);
  assert.equal(output.jobs[0].metadata.matchedQueries.length, 10);
  assert.deepEqual(output.jobs[0].metadata.seenAccounts.sort(), ["某集团招聘", "高校就业中心"].sort());
});

test("stops on CAPTCHA instead of attempting a bypass", async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, url, text: async () => "请输入验证码" });
  const output = await searchWechatArticles({ query: "产品经理" }, fetchImpl);
  assert.equal(output.jobs.length, 0);
  assert.match(output.warnings[0], /不会绕过/);
});

test("reports a redirected search homepage as a temporary restriction", async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, url, text: async () => '<form id="searchForm"><input name="query"></form>' });
  const output = await searchWechatArticles({ query: "产品经理" }, fetchImpl);
  assert.equal(output.jobs.length, 0);
  assert.match(output.warnings[0], /临时访问限制/);
});
