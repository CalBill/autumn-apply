import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import { createCompanyProvider, decryptMoka, plainText, resolveBoard, searchCompanyJobs } from "./company-careers.js";

test("resolves supported official career systems without guessing arbitrary tenants", () => {
  assert.equal(resolveBoard({ url: "https://zhaopin.meituan.com/web/social" }).provider, "meituan");
  assert.equal(resolveBoard({ url: "https://app.mokahr.com/social-recruitment/high-flyer/140576" }).provider, "moka");
  assert.equal(resolveBoard({ url: "https://jobs.lever.co/example" }).provider, "lever");
  assert.throws(() => resolveBoard({ url: "https://careers.example.com" }), /尚未支持/);
  assert.throws(() => resolveBoard({ url: "http://jobs.lever.co/example" }), /HTTPS/);
});

test("strips scripts, styles and encoded HTML from job descriptions", () => {
  assert.equal(plainText("<style>bad</style><p>数据&amp;分析</p><script>worse()</script>"), "数据&分析");
});

test("normalizes a Meituan response into the shared job shape", async () => {
  const source = { id: "meituan", name: "美团", url: "https://zhaopin.meituan.com/web/social" };
  const fetchImpl = async (_url, options) => {
    assert.equal(options.method, "POST");
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: {
          page: { totalCount: 1 },
          list: [{ jobUnionId: "42", name: "数据分析实习生", cityList: [{ name: "上海" }], jobDuty: "分析业务", jobRequirement: "熟悉 SQL", refreshTime: "2026-09-18" }],
        },
      }),
    };
  };
  const output = await searchCompanyJobs(source, { query: "数据分析" }, fetchImpl);
  assert.equal(output.jobs.length, 1);
  assert.deepEqual(output.jobs[0], {
    id: "meituan:meituan:42",
    providerId: "42",
    sourcePlatform: "美团",
    sourceName: "美团",
    sourceType: "official-career-site",
    sourceVerified: true,
    sourceUrl: "https://zhaopin.meituan.com/web/position/detail?jobUnionId=42",
    title: "数据分析实习生",
    company: "美团",
    location: "上海",
    description: "分析业务 熟悉 SQL",
    publishedAt: "2026-09-18",
    metadata: { provider: "meituan", companyId: "meituan" },
  });
});

test("decrypts the public Moka response envelope with WebCrypto", async () => {
  const encoder = new TextEncoder();
  const necromancer = "1234567890abcdef";
  const key = await webcrypto.subtle.importKey("raw", encoder.encode(necromancer), "AES-CBC", false, ["encrypt"]);
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-CBC", iv: encoder.encode("de7c21ed8d6f50fe") },
    key,
    encoder.encode(JSON.stringify({ success: true, data: { jobs: [] } })),
  );
  const envelope = { necromancer, data: Buffer.from(encrypted).toString("base64") };
  assert.deepEqual(await decryptMoka(envelope, webcrypto), { success: true, data: { jobs: [] } });
});

test("creates one provider per verified company source", () => {
  const provider = createCompanyProvider({ id: "example", name: "示例公司", url: "https://jobs.lever.co/example" }, async () => ({ ok: true, json: async () => [] }));
  assert.equal(provider.id, "example");
  assert.equal(provider.kind, "official-career-site");
});
