import assert from "node:assert/strict";
import test from "node:test";
import { createModelClient } from "../src/model-client.js";

const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

test("OpenAI client uses Responses structured outputs without storing state", async () => {
  let request;
  const client = createModelClient({
    credentials: { baseUrl: "https://api.openai.com/v1", model: "test-model", apiKey: "secret-key" },
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return Response.json({ id: "resp_1", output_text: "{\"ok\":true}" });
    },
  });
  const result = await client.generateStructured({ instructions: "test", input: "hello", schema });
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.body.store, false);
  assert.equal(request.body.text.format.type, "json_schema");
  assert.equal(request.options.headers.Authorization, "Bearer secret-key");
  assert.deepEqual(result.data, { ok: true });
});

test("DeepSeek client uses its official Responses endpoint", async () => {
  let url;
  const client = createModelClient({
    credentials: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash", apiKey: "secret-key" },
    fetchImpl: async (value) => {
      url = value;
      return Response.json({ output: [{ content: [{ type: "output_text", text: "ok" }] }] });
    },
  });
  assert.equal((await client.createResponse({ instructions: "test", input: "hello" })).text, "ok");
  assert.equal(url, "https://api.deepseek.com/responses");
});

test("provider errors are sanitized into a local API error", async () => {
  const client = createModelClient({
    credentials: { baseUrl: "https://api.openai.com/v1", model: "test", apiKey: "secret" },
    fetchImpl: async () => Response.json({ error: { message: "invalid key" } }, { status: 401 }),
  });
  await assert.rejects(() => client.createResponse({ input: "hello" }), /invalid key/);
});
