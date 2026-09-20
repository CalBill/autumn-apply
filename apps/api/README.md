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

PDF, DOCX, TXT and Markdown files are parsed locally. The service rejects payloads over 22 MB and resume files over 15 MB. Browser requests are accepted only from Chrome extensions and localhost origins.
