import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboard = join(root, "tools", "daily-video-dashboard");
const port = Number(process.env.DAILY_DASHBOARD_PORT ?? 4178);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webm": "video/webm"
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const base = relativePath.startsWith("/artifacts/") ? root : dashboard;
  const target = resolve(base, `.${relativePath}`);
  if (!target.startsWith(`${resolve(base)}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    await access(target);
  } catch {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": types[extname(target)] ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`Daily dashboard: http://127.0.0.1:${port}`));
