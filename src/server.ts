import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { AppError } from './errors';
import {
  validateBoard,
  validateBudget,
  validateExplainLimit,
  validateTiles,
} from './validation';
import { Store } from './store';
import { WangService } from './service';
import { LIMITS } from './limits';

interface Env {
  dataPath: string;
  port: number; // 0 表示由操作系统分配空闲端口
}

export function resolveEnv(argv: string[] = process.argv.slice(2)): Env {
  let dataPath = process.env.WANG_DB_PATH
    ? process.env.WANG_DB_PATH
    : resolve(process.cwd(), 'data', 'wang.db');
  let port = process.env.PORT ? Number(process.env.PORT) : 0;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--db' && argv[i + 1]) {
      dataPath = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--port' && argv[i + 1]) {
      port = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          '用法: node dist/server.js [--port 端口] [--db 数据库路径]',
          '  --port  监听端口，默认 0（由系统选择空闲端口）；也可用环境变量 PORT',
          '  --db    SQLite 数据库路径，默认 ./data/wang.db；也可用 WANG_DB_PATH',
          '',
        ].join('\n'),
      );
      process.exit(0);
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`非法端口：${port}`);
  }
  return { dataPath, port };
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 2 * 1024 * 1024) {
      throw new AppError('INVALID_PARAM', '请求体超过 2MB 上限');
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    throw new AppError('INVALID_PARAM', '请求体不是合法 JSON');
  }
}

export function createApp(service: WangService) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const method = req.method ?? 'GET';

      if (method === 'GET' && path === '/health') {
        return send(res, 200, { ok: true, limits: LIMITS });
      }

      // ---- 方块集 / 版本 ----
      let m = /^\/tile-sets\/(\d+)\/versions$/.exec(path);
      if (method === 'GET' && m) {
        return send(res, 200, { versions: service.listVersions(Number(m[1])) });
      }
      if (method === 'POST' && path === '/tile-sets') {
        const body = (await readJson(req)) as { name?: unknown; tiles?: unknown };
        const name = typeof body.name === 'string' && body.name.trim() ? body.name : '未命名方块集';
        const tiles = validateTiles(body.tiles);
        const created = service.createTileSet(name, tiles);
        return send(res, 201, { ...created, tileCount: tiles.length });
      }
      m = /^\/tile-sets\/(\d+)\/versions$/.exec(path);
      if (method === 'POST' && m) {
        const body = (await readJson(req)) as { tiles?: unknown };
        const tiles = validateTiles(body.tiles);
        const created = service.addTileVersion(Number(m[1]), tiles);
        return send(res, 201, { ...created, tileCount: tiles.length });
      }
      m = /^\/versions\/(\d+)\/tiles$/.exec(path);
      if (method === 'GET' && m) {
        return send(res, 200, { tiles: service.getTiles(Number(m[1])) });
      }

      // ---- 棋盘 ----
      if (method === 'POST' && path === '/boards') {
        const body = (await readJson(req)) as { versionId?: unknown; board?: unknown };
        const versionId = Number(body.versionId);
        if (!Number.isInteger(versionId)) {
          throw new AppError('INVALID_PARAM', 'versionId 必须是整数');
        }
        const tiles = service.getTiles(versionId);
        const board = validateBoard(body.board, new Set(tiles.map((t) => t.id)));
        const boardId = service.createBoard(versionId, board);
        return send(res, 201, { boardId, board });
      }
      m = /^\/boards\/(\d+)$/.exec(path);
      if (method === 'GET' && m) {
        const data = service.getBoard(Number(m[1]));
        return send(res, 200, data);
      }
      m = /^\/boards\/(\d+)\/conflicts$/.exec(path);
      if (method === 'GET' && m) {
        return send(res, 200, service.checkConflicts(Number(m[1])));
      }

      // ---- 搜索 ----
      m = /^\/boards\/(\d+)\/solve$/.exec(path);
      if (method === 'POST' && m) {
        const body = (await readJson(req)) as { budget?: unknown; explainLimit?: unknown };
        const budget = validateBudget(body.budget);
        const explainLimit = validateExplainLimit(body.explainLimit);
        return send(res, 200, service.runSearch(Number(m[1]), budget, explainLimit));
      }
      m = /^\/searches\/(\d+)$/.exec(path);
      if (method === 'GET' && m) {
        return send(res, 200, service.getSearch(Number(m[1])));
      }

      // ---- 独立核验与导出 ----
      m = /^\/boards\/(\d+)\/verify$/.exec(path);
      if (method === 'POST' && m) {
        const body = (await readJson(req)) as { solution?: unknown; matrix?: unknown };
        return send(res, 200, service.verify(Number(m[1]), body.solution ?? body.matrix));
      }
      m = /^\/searches\/(\d+)\/export$/.exec(path);
      if (method === 'GET' && m) {
        res.setHeader('content-disposition', `attachment; filename="wang-search-${m[1]}.json"`);
        return send(res, 200, service.exportResult(Number(m[1])));
      }

      return send(res, 404, { error: { code: 'NOT_FOUND', message: `无此路由：${method} ${path}` } });
    } catch (err) {
      if (err instanceof AppError) {
        return send(res, err.code === 'NOT_FOUND' ? 404 : 400, {
          error: { code: err.code, message: err.message, details: err.details ?? null },
        });
      }
      const message = err instanceof Error ? err.message : String(err);
      return send(res, 500, { error: { code: 'INTERNAL', message } });
    }
  });
  return server;
}

if (require.main === module) {
  const env = resolveEnv();
  const store = new Store(env.dataPath);
  const service = new WangService(store);
  const server = createApp(service);
  server.listen(env.port, '127.0.0.1', () => {
    const addr = server.address() as AddressInfo;
    process.stdout.write(
      [
        `Wang 方块服务已启动：http://127.0.0.1:${addr.port}`,
        `数据文件：${env.dataPath}`,
        `健康检查：GET http://127.0.0.1:${addr.port}/health`,
        '',
      ].join('\n'),
    );
  });

  const shutdown = () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
