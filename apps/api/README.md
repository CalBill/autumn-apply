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

PDF, DOCX, TXT and Markdown files are parsed locally. The service rejects payloads over 22 MB and resume files over 15 MB. Browser requests are accepted only from Chrome extensions and localhost origins.

On macOS, BYOK secrets are stored in Keychain under `dev.autumn-apply.api-key`. Only provider, official base URL and model name are written to `~/.config/autumn-apply/provider.json` with mode `0600`. Other platforms can provide `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` through the environment; plaintext key files are intentionally unsupported.
