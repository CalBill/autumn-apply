function responseText(body) {
  if (typeof body?.output_text === "string" && body.output_text) return body.output_text;
  return (body?.output ?? [])
    .flatMap((item) => item?.content ?? [])
    .filter((item) => item?.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function endpoint(baseUrl, resource) {
  return new URL(resource.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`).href;
}

export function createModelClient({ credentials, fetchImpl = fetch, timeoutMs = 60_000 }) {
  if (!credentials?.apiKey) throw new Error("缺少模型服务API Key");

  async function createResponse({ instructions, input, schema, schemaName = "autumn_apply_result", tools = [], toolChoice, include = [] }) {
    const body = {
      model: credentials.model,
      instructions,
      input,
      store: false,
      ...(schema ? {
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
      } : {}),
      ...(tools.length ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      ...(include.length ? { include } : {}),
    };
    const response = await fetchImpl(endpoint(credentials.baseUrl, "responses"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `模型服务请求失败：HTTP ${response.status}`;
      throw Object.assign(new Error(message), { statusCode: response.status >= 500 ? 502 : 422 });
    }
    const text = responseText(payload);
    if (!text) throw Object.assign(new Error("模型服务没有返回文本结果"), { statusCode: 502 });
    return { text, responseId: payload.id ?? null, usage: payload.usage ?? null, raw: payload };
  }

  async function generateStructured(options) {
    const result = await createResponse(options);
    try {
      return { ...result, data: JSON.parse(result.text) };
    } catch {
      throw Object.assign(new Error("模型返回内容不符合JSON结构"), { statusCode: 502 });
    }
  }

  return { createResponse, generateStructured };
}

export function createConfiguredModelFactory({ settings, fetchImpl = fetch } = {}) {
  return async () => createModelClient({ credentials: await settings.credentials(), fetchImpl });
}
