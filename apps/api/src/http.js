import http from "node:http";
import { parseResumeBuffer } from "./resume-parser.js";
import { createProviderSettingsStore } from "./provider-settings.js";
import { createConfiguredModelFactory } from "./model-client.js";
import { analyzeSemanticMatch, createAiApplicationPackage, structureResumeWithAi } from "./ai-workflows.js";
import { searchJobsWithAi } from "./web-search.js";
import { markdownResumeToDocx } from "./document-export.js";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 43127;
const MAX_JSON_BYTES = 22 * 1024 * 1024;

function allowedOrigin(origin) {
  return !origin || origin.startsWith("chrome-extension://") || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin);
}

function writeJson(response, statusCode, value, origin = "") {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(origin && allowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw Object.assign(new Error("请求内容不能超过 22 MB"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("请求内容必须是有效 JSON"), { statusCode: 400 });
  }
}

function decodeBase64(value) {
  if (typeof value !== "string" || !value) throw Object.assign(new Error("缺少简历文件内容"), { statusCode: 400 });
  const buffer = Buffer.from(value, "base64");
  if (!buffer.length) throw Object.assign(new Error("简历文件内容为空"), { statusCode: 400 });
  return buffer;
}

export function createLocalApiServer({ parseResume = parseResumeBuffer, settings = createProviderSettingsStore(), modelFactory } = {}) {
  const configuredModelFactory = modelFactory ?? createConfiguredModelFactory({ settings });
  return http.createServer(async (request, response) => {
    const origin = request.headers.origin ?? "";
    if (!allowedOrigin(origin)) {
      writeJson(response, 403, { error: "不允许的请求来源" });
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true, service: "autumn-apply-local-api", version: "0.6.0" }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/resumes/parse") {
        const body = await readJson(request);
        const result = await parseResume({
          buffer: decodeBase64(body.dataBase64),
          filename: String(body.filename || "resume"),
          mimeType: String(body.mimeType || ""),
        });
        writeJson(response, 200, result, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/documents/docx") {
        const body = await readJson(request);
        const document = await markdownResumeToDocx(body.markdown, body.title);
        writeJson(response, 200, {
          filename: `${String(body.title || "AutumnApply-岗位版简历").replace(/[\\/:*?"<>|]/g, "-").slice(0, 120)}.docx`,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          dataBase64: document.toString("base64"),
        }, origin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/settings/provider") {
        writeJson(response, 200, await settings.status(), origin);
        return;
      }
      if (request.method === "PUT" && url.pathname === "/v1/settings/provider") {
        writeJson(response, 200, await settings.update(await readJson(request)), origin);
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/v1/settings/provider/key") {
        writeJson(response, 200, await settings.removeKey(), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/ai/test") {
        const model = await configuredModelFactory();
        const result = await model.createResponse({
          instructions: "Reply with exactly the Chinese word：连接成功",
          input: "Test this API connection.",
        });
        const status = await settings.status();
        writeJson(response, 200, { ok: true, provider: status.provider, model: status.model, message: result.text.slice(0, 120), usage: result.usage }, origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/ai/resumes/structure") {
        const body = await readJson(request);
        const model = await configuredModelFactory();
        writeJson(response, 200, await structureResumeWithAi({ resumeText: body.text, model }), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/ai/match") {
        const body = await readJson(request);
        const model = await configuredModelFactory();
        writeJson(response, 200, await analyzeSemanticMatch({ profile: body.profile, job: body.job, model }), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/ai/application-package") {
        const body = await readJson(request);
        const model = await configuredModelFactory();
        writeJson(response, 200, await createAiApplicationPackage({
          profile: body.profile, job: body.job, supplementalAnswers: body.supplementalAnswers, model,
        }), origin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/ai/search") {
        const body = await readJson(request);
        const provider = (await settings.status()).provider;
        const model = await configuredModelFactory();
        writeJson(response, 200, await searchJobsWithAi({ profile: body.profile, instructions: body.instructions, model, provider }), origin);
        return;
      }
      writeJson(response, 404, { error: "接口不存在" }, origin);
    } catch (error) {
      writeJson(response, error.statusCode ?? 422, { error: error.message || "请求处理失败" }, origin);
    }
  });
}

export function listen(server, { host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}
