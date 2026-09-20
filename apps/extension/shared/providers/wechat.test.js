import assert from "node:assert/strict";
import test from "node:test";

import { isRecruitmentArticle, parseSogouWechatArticles, searchWechatArticles } from "./wechat.js";

const fixture = `
  <ul class="news-list">
    <li>
      <div class="txt-box">
        <h3><a href="/link?url=abc">某集团2027届秋季校园招聘正式启动</a></h3>
        <p class="txt-info">面向2027届毕业生，北京、上海均有数据分析岗位，点击进入官方网申。</p>
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
  assert.equal(articles[0].company, "某集团招聘");
  assert.equal(articles[0].location, "北京/上海");
  assert.equal(articles[0].sourceType, "wechat-article");
  assert.equal(articles[0].sourceVerified, false);
  assert.match(articles[0].sourceUrl, /^https:\/\/weixin\.sogou\.com\/link/);
});

test("adds a recruitment signal to generic user queries", async () => {
  let requestedUrl = "";
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return { ok: true, status: 200, url, text: async () => fixture };
  };
  const output = await searchWechatArticles({ query: "数据分析", graduationYear: "2027", pageSize: 10 }, fetchImpl);
  assert.match(decodeURIComponent(requestedUrl), /query=数据分析\+2027届\+校招/);
  assert.equal(output.jobs.length, 1);
});

test("stops on CAPTCHA instead of attempting a bypass", async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, url, text: async () => "请输入验证码" });
  await assert.rejects(() => searchWechatArticles({ query: "产品经理" }, fetchImpl), /不会绕过/);
});
