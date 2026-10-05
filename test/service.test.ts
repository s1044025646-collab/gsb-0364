import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import { WangService } from "../src/service.js";
import { createServer } from "../src/api.js";
import type { AddressInfo } from "node:net";

function makeService() {
  return new WangService(new Store(":memory:"));
}

const tilesA = { tiles: [{ id: "A", top: "x", right: "x", bottom: "x", left: "x" }] };

test("服务：建集、建棋盘、搜索、核验、导出全链路", () => {
  const svc = makeService();
  const ts = svc.createTileset(tilesA);
  assert.equal(ts.version, 1);
  const board = svc.createBoard({ tilesetId: ts.id, width: 2, height: 2 });
  const report = svc.runSearch(board.id, undefined);
  assert.equal(report.status, "solved");
  const v = svc.verify(board.id, report.solution);
  assert.equal(v.ok, true);
  const exp = svc.exportSearch(report.searchId);
  assert.equal(exp.search.searchId, report.searchId);
  assert.equal(exp.solutionVerification!.ok, true);
});

test("服务：方块集不可变，修改创建新版本，旧搜索仍引用旧版本", () => {
  const svc = makeService();
  const ts1 = svc.createTileset(tilesA);
  const ts2 = svc.createTileset({ tiles: [{ id: "B", top: "y", right: "y", bottom: "y", left: "y" }] }, ts1.id);
  assert.equal(ts2.version, 2);
  assert.equal(svc.getTileset(ts1.id, 1).tiles[0].id, "A");
  assert.equal(svc.getTileset(ts1.id).tiles[0].id, "B");
});

test("服务：固定格局部冲突检查", () => {
  const svc = makeService();
  const ts = svc.createTileset({
    tiles: [
      { id: "A", top: "x", right: "p", bottom: "x", left: "x" },
      { id: "B", top: "x", right: "x", bottom: "x", left: "q" },
    ],
  });
  const board = svc.createBoard({
    tilesetId: ts.id,
    width: 2,
    height: 1,
    fixed: [
      { row: 0, col: 0, tileId: "A" },
      { row: 0, col: 1, tileId: "B" },
    ],
  });
  const violations = svc.checkFixed(board.id);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, "neighbor_mismatch");
});

test("服务：重启后（重开数据库）仍可查询方案", () => {
  const svc = makeService();
  const ts = svc.createTileset(tilesA);
  const board = svc.createBoard({ tilesetId: ts.id, width: 1, height: 1 });
  const report = svc.runSearch(board.id, undefined);
  const again = svc.getSearch(report.searchId);
  assert.deepEqual(again.solution, [["A"]]);
});

test("HTTP API：端到端", async () => {
  const svc = makeService();
  const server = createServer(svc);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const get = async (path: string) => {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.json() };
  };

  const ts = await post("/tilesets", tilesA);
  assert.equal(ts.status, 201);
  const bad = await post("/tilesets", { tiles: [] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "TILES_EMPTY");

  const bd = await post("/boards", { tilesetId: ts.body.id, width: 2, height: 2 });
  assert.equal(bd.status, 201);
  const search = await post(`/boards/${bd.body.id}/search`, { maxNodes: 1000 });
  assert.equal(search.status, 201);
  assert.equal(search.body.status, "solved");

  const shown = await get(`/searches/${search.body.searchId}`);
  assert.equal(shown.body.solution.length, 2);
  const exp = await get(`/searches/${search.body.searchId}/export`);
  assert.equal(exp.body.solutionVerification.ok, true);

  const verify = await post(`/boards/${bd.body.id}/verify`, { grid: [["A", "A"], ["A", "A"]] });
  assert.equal(verify.body.ok, true);

  const missing = await get("/boards/nope");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "BOARD_NOT_FOUND");

  await new Promise((resolve) => server.close(resolve));
});
