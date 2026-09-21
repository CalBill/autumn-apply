# Local API

The local service parses resume files and is the security boundary for optional external model requests. It binds to `127.0.0.1:43127`; it is not exposed on the LAN.

```bash
npm install
npm run start:api
curl http://127.0.0.1:43127/health
```

Current endpoints:

- `GET /health`
- `POST /v1/resumes/parse` with `{ filename, mimeType, dataBase64 }`
- `GET/PUT /v1/settings/provider`
- `DELETE /v1/settings/provider/key`
- `POST /v1/ai/test`
- `POST /v1/ai/resumes/structure`
- `POST /v1/ai/match`
- `POST /v1/ai/search` (OpenAI or 智谱 GLM)
- `POST /v1/ai/application-package`
- `POST /v1/documents/docx`

PDF, DOCX, TXT and Markdown files are parsed locally. The service rejects payloads over 22 MB and resume files over 15 MB. Browser requests are accepted only from Chrome extensions and localhost origins.

On macOS, BYOK secrets are stored in Keychain under `dev.autumn-apply.api-key`. On Windows, the secret is encrypted with DPAPI's `CurrentUser` scope before the ciphertext is stored under `%APPDATA%\AutumnApply`; another Windows account cannot decrypt it. Only provider, official base URL and model name are stored as ordinary configuration. Linux can provide `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` through the environment; plaintext key files are intentionally unsupported.

OpenAI and DeepSeek use their official Responses-compatible endpoints; their requests set `store: false`. 智谱 GLM uses its official `chat/completions` endpoint. API keys stay inside the local service and are never returned to the extension.

Resume AI structuring is an explicit second step after local text extraction. Semantic job matching strips the candidate's name, email, phone and links before sending education, experience, skills and preferences to the configured provider. Both workflows use strict JSON schemas and label missing evidence as unknown instead of guessing.

AI web discovery runs only after an explicit click. It supports OpenAI's hosted `web_search` and 智谱 GLM's official `web-search-pro`. For GLM, the service accepts only HTTPS links that the search API actually returned, then applies the same public-address and reachability/content-signal checks. Private-network, localhost, credential-bearing and non-HTTPS URLs are rejected. DeepSeek remains available for structuring and matching but is not presented as having hosted web search.

The DOCX endpoint receives an already reviewed profile and resume variant, then returns a base64-encoded Word document. It does not contact an external model. PDF export is implemented in the extension as a print view so the user can inspect the document before choosing **Save as PDF**.
