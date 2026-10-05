import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../store';
import { WangService } from '../service';
import { validateBoard, validateTiles } from '../validation';

function freshService(): { service: WangService; dir: string; reopen: () => WangService } {
  const dir = mkdtempSync(join(tmpdir(), 'wang-test-'));
  const dbPath = join(dir, 'test.db');
  const open = () => new WangService(new Store(dbPath));
  return { service: open(), dir, reopen: open };
}

const tilesA = validateTiles([{ id: 'M', N: 'r', E: 'r', S: 'r', W: 'r' }]);
const board1x1 = validateBoard({ rows: 1, cols: 1 });

test('重启后仍可查询完整方案与核验明细', () => {
  const ctx = freshService();
  const { versionId } = ctx.service.createTileSet('s', tilesA);
  const boardId = ctx.service.createBoard(versionId, board1x1);
  const resp = ctx.service.runSearch(boardId, 100, 50);
  assert.equal(resp.result.status, 'solved');
  assert.equal(resp.verification?.valid, true);
  const searchId = resp.searchId;
  ctx.service.store.close();

  const reopened = ctx.reopen();
  const loaded = reopened.getSearch(searchId);
  assert.deepEqual(loaded.result.solution, [['M']]);
  assert.equal(loaded.verification?.valid, true);
  assert.ok(loaded.result.explanation.length >= 1);
  reopened.store.close();
});

test('不可变版本：修改方块创建新版本，旧棋盘仍绑定旧版本', () => {
  const ctx = freshService();
  const { setId, versionId: v1 } = ctx.service.createTileSet('s', tilesA);
  const boardId = ctx.service.createBoard(v1, board1x1);

  const tilesB = validateTiles([{ id: 'M', N: 'b', E: 'b', S: 'b', W: 'b' }]);
  const v2 = ctx.service.addTileVersion(setId, tilesB);
  assert.notEqual(v2.versionId, v1);

  // 旧棋盘仍引用旧版本（r），外边要求 r 仍可解
  const old = ctx.service.runSearch(boardId, 100, 10);
  assert.equal(old.result.status, 'solved');

  // 新版本棋盘受 b 外边约束无解
  const impossibleBoard = validateBoard({
    rows: 1,
    cols: 1,
    borders: { top: ['r'], right: [null], bottom: [null], left: [null] },
  });
  const board2 = ctx.service.createBoard(v2.versionId, impossibleBoard);
  const res2 = ctx.service.runSearch(board2, 100, 10);
  assert.equal(res2.result.status, 'unsatisfiable');

  // 旧方案不会被用新方块解释：导出仍带 versionId=v1
  const exported = ctx.service.exportResult(old.searchId);
  assert.equal(exported.versionId, v1);
  ctx.service.store.close();
});

test('再次运行搜索生成新报告，旧未完成搜索保留 budget 状态', () => {
  const ctx = freshService();
  const { versionId } = ctx.service.createTileSet('s', tilesA);
  const boardId = ctx.service.createBoard(versionId, board1x1);
  const tiny = ctx.service.runSearch(boardId, 1, 0);
  // 1x1 在 budget 1 内可解；改用 2x2 需要更多访问
  const board2x2 = validateBoard({ rows: 2, cols: 2 });
  const id2 = ctx.service.createBoard(versionId, board2x2);
  const r1 = ctx.service.runSearch(id2, 1, 10);
  assert.equal(r1.result.status, 'budget');
  const r2 = ctx.service.runSearch(id2, 1000, 10);
  assert.equal(r2.result.status, 'solved');
  assert.notEqual(r1.searchId, r2.searchId);

  const old = ctx.service.getSearch(r1.searchId);
  assert.equal(old.result.status, 'budget');
  assert.ok(tiny.searchId > 0);
  assert.equal(tiny.result.status, 'solved');
  ctx.service.store.close();
});

test('独立 verify 接口拒绝未知编号矩阵', () => {
  const ctx = freshService();
  const { versionId } = ctx.service.createTileSet('s', tilesA);
  const boardId = ctx.service.createBoard(versionId, board1x1);
  const report = ctx.service.verify(boardId, [['UNKNOWN']]);
  assert.equal(report.valid, false);
  assert.equal(report.issues[0].kind, 'unknown-tile');
  ctx.service.store.close();
});
