import test from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Server } from 'node:http';
import { Store } from '../store';
import { WangService } from '../service';
import { createApp } from '../server';

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'wang-api-'));
  const service = new WangService(new Store(join(dir, 'api.db')));
  const server: Server = createApp(service);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    service.store.close();
  }
}

async function post(base: string, path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function get(base: string, path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path);
  return { status: res.status, json: await res.json() };
}

test('HTTP 全链路：建集 -> 建棋盘 -> 搜索 -> 独立核验 -> 篡改被抓', async () => {
  await withServer(async (base) => {
    const health = await get(base, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);

    const created = await post(base, '/tile-sets', {
      name: 'api',
      tiles: [
        { id: 'A', N: 'b', E: 'w', S: 'w', W: 'b' },
        { id: 'B', N: 'w', E: 'b', S: 'b', W: 'w' },
      ],
    });
    assert.equal(created.status, 201);
    const versionId = created.json.versionId;

    const board = await post(base, '/boards', {
      versionId,
      board: { rows: 2, cols: 2, fixed: { '0,0': 'A' } },
    });
    assert.equal(board.status, 201);
    const boardId = board.json.boardId;

    const solved = await post(base, `/boards/${boardId}/solve`, { budget: 1000 });
    assert.equal(solved.status, 200);
    assert.equal(solved.json.result.status, 'solved');
    assert.equal(solved.json.verification.valid, true);
    const searchId = solved.json.searchId;

    const fetched = await get(base, `/searches/${searchId}`);
    assert.equal(fetched.json.result.status, 'solved');

    const exported = await get(base, `/searches/${searchId}/export`);
    assert.equal(exported.json.verification.valid, true);

    // 篡改方案后独立核验必须失败并给出 edge-mismatch
    const tampered = solved.json.result.solution.map((row: string[]) => [...row]);
    tampered[1][1] = tampered[1][1] === 'A' ? 'B' : 'A';
    const verdict = await post(base, `/boards/${boardId}/verify`, { solution: tampered });
    assert.equal(verdict.json.valid, false);
    assert.ok(verdict.json.issues.some((i: any) => i.kind === 'edge-mismatch'));
  });
});

test('HTTP 参数错误返回 400 与错误码，而非 500', async () => {
  await withServer(async (base) => {
    const badTiles = await post(base, '/tile-sets', { tiles: [] });
    assert.equal(badTiles.status, 400);
    assert.equal(badTiles.json.error.code, 'INVALID_PARAM');

    const badBoard = await post(base, '/boards', {
      versionId: 9999,
      board: { rows: 1, cols: 1 },
    });
    assert.equal(badBoard.status, 404);
    assert.equal(badBoard.json.error.code, 'NOT_FOUND');
  });
});

test('HTTP 无解与预算不足状态正确区分', async () => {
  await withServer(async (base) => {
    const created = await post(base, '/tile-sets', {
      tiles: [{ id: 'X', N: 'b', E: 'b', S: 'b', W: 'b' }],
    });
    const versionId = created.json.versionId;
    const board = await post(base, '/boards', {
      versionId,
      board: {
        rows: 1,
        cols: 1,
        borders: { top: ['b'], right: ['b'], bottom: ['b'], left: ['w'] },
      },
    });
    const boardId = board.json.boardId;
    const unsat = await post(base, `/boards/${boardId}/solve`, {});
    assert.equal(unsat.json.result.status, 'unsatisfiable');

    const board2 = await post(base, '/boards', {
      versionId,
      board: { rows: 2, cols: 2 },
    });
    const budget = await post(base, `/boards/${board2.json.boardId}/solve`, { budget: 1 });
    assert.equal(budget.json.result.status, 'budget');
  });
});
