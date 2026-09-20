import assert from "node:assert/strict";
import test from "node:test";
import { createLocalApiServer, listen } from "../src/http.js";

async function withServer(parseResume, callback, modelFactory) {
  const settings = {
    status: async () => ({ provider: "openai", model: "test", apiKeyConfigured: false }),
    update: async (value) => ({ provider: value.provider, model: value.model, apiKeyConfigured: Boolean(value.apiKey) }),
    removeKey: async () => ({ provider: "openai", model: "test", apiKeyConfigured: false }),
  };
  const server = createLocalApiServer({ parseResume, settings, modelFactory });
  const address = await listen(server, { port: 0 });
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("health endpoint reports a local service", async () => {
  await withServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).service, "autumn-apply-local-api");
  });
});

test("resume endpoint decodes files before invoking the parser", async () => {
  await withServer(async (input) => ({ filename: input.filename, text: input.buffer.toString("utf8") }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/resumes/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "chrome-extension://test-extension" },
      body: JSON.stringify({ filename: "resume.txt", dataBase64: Buffer.from("简历内容").toString("base64") }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { filename: "resume.txt", text: "简历内容" });
    assert.equal(response.headers.get("access-control-allow-origin"), "chrome-extension://test-extension");
  });
});

test("browser origins outside the extension and localhost are rejected", async () => {
  await withServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://malicious.example" } });
    assert.equal(response.status, 403);
  });
});

test("provider settings expose status but never echo the API key", async () => {
  await withServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/settings/provider`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-flash", apiKey: "secret-value" }),
    });
    const body = await response.json();
    assert.equal(body.apiKeyConfigured, true);
    assert.equal(body.apiKey, undefined);
  });
});

test("AI test endpoint returns provider status without exposing credentials", async () => {
  const modelFactory = async () => ({ createResponse: async () => ({ text: "连接成功", usage: { total_tokens: 3 } }) });
  await withServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/ai/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.deepEqual(await response.json(), {
      ok: true, provider: "openai", model: "test", message: "连接成功", usage: { total_tokens: 3 },
    });
  }, modelFactory);
});

test("AI match endpoint returns a structured assessment", async () => {
  const assessment = { score: 90, summary: "高度匹配", recommendation: "apply", hardRequirements: [], strengths: [], gaps: [], warnings: [] };
  const modelFactory = async () => ({ generateStructured: async () => ({ data: assessment, responseId: "resp_match", usage: null }) });
  await withServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/ai/match`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: { skills: ["合规"], preferences: {} }, job: { title: "合规岗", description: "招聘2027届毕业生" } }),
    });
    const body = await response.json();
    assert.equal(body.assessment.score, 90);
    assert.equal(body.responseId, "resp_match");
  }, modelFactory);
});

test("AI application package endpoint returns source-grounded material", async () => {
  const modelFactory = async () => ({
    generateStructured: async () => ({ data: {
      summary: "完成", experiences: [], projects: [], missingQuestions: [], openQuestionDrafts: [], warnings: [],
    } }),
  });
  await withServer(undefined, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/ai/application-package`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: { education: [], experiences: [], projects: [], skills: [], preferences: {} }, job: { title: "管培生", description: "校园招聘管培生岗位" } }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.package.summary, "完成");
  }, modelFactory);
});
