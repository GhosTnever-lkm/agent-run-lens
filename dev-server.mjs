import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 8897);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".jsonl": "application/jsonl; charset=utf-8", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8" };

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
  try {
    const decoded = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    const target = resolve(root, relative);
    if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const contents = await readFile(target);
    response.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
    if (request.method === "HEAD") response.end(); else response.end(contents);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Agent Run Lens: http://127.0.0.1:${port}/`));
