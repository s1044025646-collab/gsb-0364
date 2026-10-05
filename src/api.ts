import http from "node:http";
import path from "node:path";
import { Store } from "./store.js";
import { WangService } from "./service.js";
import { ApiError } from "./validate.js";

export function createServer(service: WangService): http.Server {
  const routes: Array<[string, RegExp, (m: RegExpMatchArray, body: unknown) => unknown]> = [
    ["POST", /^\/tilesets$/, (_m, body) => service.createTileset(body)],
    ["POST", /^\/tilesets\/([^/]+)\/versions$/, (m, body) => service.createTileset(body, m[1])],
    ["GET", /^\/tilesets\/([^/]+)$/, (m) => service.getTileset(m[1])],
    ["POST", /^\/boards$/, (_m, body) => service.createBoard(body)],
    ["GET", /^\/boards\/([^/]+)$/, (m) => service.getBoard(m[1])],
    ["POST", /^\/boards\/([^/]+)\/check-fixed$/, (m) => ({ violations: service.checkFixed(m[1]) })],
    ["POST", /^\/boards\/([^/]+)\/search$/, (m, body) => service.runSearch(m[1], (body as Record<string, unknown> | null)?.maxNodes)],
    ["GET", /^\/boards\/([^/]+)\/searches$/, (m) => service.store.listSearches(m[1])],
    ["POST", /^\/boards\/([^/]+)\/verify$/, (m, body) => service.verify(m[1], (body as Record<string, unknown> | null)?.grid)],
    ["GET", /^\/searches\/([^/]+)$/, (m) => service.getSearch(m[1])],
    ["GET", /^\/searches\/([^/]+)\/export$/, (m) => service.exportSearch(m[1])],
  ];

  return http.createServer((req, res) => {
    const send = (status: number, payload: unknown) => {
      const data = JSON.stringify(payload, null, 2);
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(data);
    };
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname;
        let body: unknown = null;
        if (chunks.length > 0) {
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            throw new ApiError(400, "BAD_JSON", "请求体不是合法 JSON");
          }
        }
        for (const [method, pattern, handler] of routes) {
          if (req.method !== method) continue;
          const m = pathname.match(pattern);
          if (!m) continue;
          const result = handler(m, body);
          const created = method === "POST" && (pathname === "/tilesets" || pathname === "/boards" || /\/versions$/.test(pathname) || /\/search$/.test(pathname));
          send(created ? 201 : 200, result);
          return;
        }
        throw new ApiError(404, "NOT_FOUND", `路由不存在: ${req.method} ${pathname}`);
      } catch (err) {
        if (err instanceof ApiError) {
          send(err.status, { error: { code: err.code, message: err.message } });
        } else {
          send(500, { error: { code: "INTERNAL", message: String(err) } });
        }
      }
    });
  });
}

export function defaultDbPath(): string {
  return process.env.WANG_DB ?? path.join(process.cwd(), "data", "wang.db");
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href) {
  const service = new WangService(new Store(defaultDbPath()));
  const server = createServer(service);
  const portArg = process.argv.indexOf("--port");
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : process.env.PORT ? Number(process.env.PORT) : 0;
  server.listen(port, () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    console.log(`Wang 方块拼接服务已启动: http://127.0.0.1:${p}`);
  });
}
