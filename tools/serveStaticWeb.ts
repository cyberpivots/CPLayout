import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const [rootArg = "apps/mobile/dist", portArg = "19006"] = process.argv.slice(2);
const root = resolve(rootArg);
const port = Number(portArg);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid static server port: ${portArg}`);
}

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = normalize(join(root, pathname));
  const filePath = resolve(requested).startsWith(root)
    ? resolve(requested)
    : join(root, "index.html");
  const candidate = fileForPath(filePath);

  if (!candidate) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypes[extname(candidate)] ?? "application/octet-stream",
  });
  createReadStream(candidate).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});

function fileForPath(filePath: string): string | null {
  if (existsSync(filePath) && statSync(filePath).isFile()) return filePath;
  const index = join(root, "index.html");
  return existsSync(index) ? index : null;
}
