import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

const root = resolve("dist/extension");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
    const requestedPath = resolve(root, relativePath || "options.html");
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(requestedPath);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": mimeTypes[extname(requestedPath)] ?? "application/octet-stream" });
    createReadStream(requestedPath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(4173, "127.0.0.1", () => {
  console.log("Synthetic job page: http://127.0.0.1:4173/test-fixtures/generic-job-form.html");
});
