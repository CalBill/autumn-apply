import assert from "node:assert/strict";
import test from "node:test";
import { createLocalApiServer, listen } from "../src/http.js";

async function withServer(parseResume, callback) {
  const settings = {
    status: async () => ({ provider: "openai", model: "test", apiKeyConfigured: false }),
    update: async (value) => ({ provider: value.provider, model: value.model, apiKeyConfigured: Boolean(value.apiKey) }),
    removeKey: async () => ({ provider: "openai", model: "test", apiKeyConfigured: false }),
  };
  const server = createLocalApiServer({ parseResume, settings });
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
