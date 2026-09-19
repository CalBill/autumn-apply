import assert from "node:assert/strict";
import test from "node:test";

import { fetchTencentJobDetail, normalizeTencentListPost, searchTencentJobs } from "./tencent.js";

function response(data) {
  return { ok: true, status: 200, json: async () => ({ Code: 200, Data: data }) };
}

test("Tencent list records normalize to the shared job shape", () => {
  const job = normalizeTencentListPost({
    PostId: "123456789012",
    RecruitPostName: "数据分析实习生",
    LocationName: "上海",
    LastUpdateTime: "2026年09月18日",
  });
  assert.equal(job.company, "腾讯");
  assert.equal(job.location, "上海");
  assert.equal(job.publishedAt, "2026-09-18");
  assert.match(job.sourceUrl, /postId=123456789012/);
});

test("Tencent search and detail use public read-only endpoints", async () => {
  const urls = [];
  const fakeFetch = async (url, options) => {
    urls.push({ url: String(url), options });
    if (String(url).includes("ByPostId")) {
      return response({
        PostId: "123456789012",
        RecruitPostName: "数据分析实习生",
        LocationName: "上海",
        Responsibility: "使用 SQL 分析业务数据",
        Requirement: "本科及以上学历，熟悉 Python",
      });
    }
    return response({ Count: 1, Posts: [{ PostId: "123456789012", RecruitPostName: "数据分析实习生" }] });
  };

  const search = await searchTencentJobs({ query: "数据分析" }, fakeFetch);
  const detail = await fetchTencentJobDetail("123456789012", fakeFetch);
  assert.equal(search.total, 1);
  assert.match(detail.description, /SQL/);
  assert.equal(urls.every((entry) => entry.options.method === "GET" && entry.options.credentials === "omit"), true);
});
