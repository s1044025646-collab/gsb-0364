import test from "node:test";
import assert from "node:assert/strict";
import { solve } from "../src/solver.js";
import { verifyCandidate } from "../src/verify.js";
import { validateTiles, validateFixed, validateBoundary, validateBoardDims, ApiError, unconstrainedBoundary } from "../src/validate.js";
import type { BoardInput, Tile } from "../src/types.js";

const tile = (id: string, top: string, right: string, bottom: string, left: string): Tile => ({ id, top, right, bottom, left });

function board(width: number, height: number, extra: Partial<BoardInput> = {}): BoardInput {
  return {
    tilesetId: "t",
    tilesetVersion: 1,
    width,
    height,
    boundary: unconstrainedBoundary(width, height),
    fixed: [],
    ...extra,
  };
}

test("一格棋盘：单块直接成功", () => {
  const r = solve(board(1, 1), [tile("A", "x", "x", "x", "x")], 100);
  assert.equal(r.status, "solved");
  assert.deepEqual(r.solution, [["A"]]);
});

test("一格棋盘：外边颜色不匹配则无解", () => {
  const b = board(1, 1);
  b.boundary.top = ["y"];
  const r = solve(b, [tile("A", "x", "x", "x", "x")], 100);
  assert.equal(r.status, "unsat");
  assert.match(r.trace[0].reason, /上边界/);
});

test("单行棋盘：横向必须相接", () => {
  const tiles = [tile("A", "c", "p", "c", "q"), tile("B", "c", "q", "c", "p")];
  const r = solve(board(3, 1), tiles, 1000);
  assert.equal(r.status, "solved");
  assert.equal(verifyCandidate(board(3, 1), tiles, r.solution).length, 0);
});

test("单列棋盘：竖向必须相接", () => {
  const tiles = [tile("A", "q", "c", "p", "c"), tile("B", "p", "c", "q", "c")];
  const r = solve(board(1, 3), tiles, 1000);
  assert.equal(r.status, "solved");
  assert.equal(verifyCandidate(board(1, 3), tiles, r.solution).length, 0);
});

test("只在竖向发生的冲突：横向兼容但竖向不兼容导致无解", () => {
  const tiles = [tile("A", "x", "k", "y", "k")];
  const r = solve(board(1, 2), tiles, 100);
  assert.equal(r.status, "unsat");
  assert.ok(r.trace.some((t) => t.reason.includes("上方格子")));
});

test("相同四边不同编号：均保留且按编号稳定排序", () => {
  const tiles = [tile("B", "x", "x", "x", "x"), tile("A", "x", "x", "x", "x")];
  const r1 = solve(board(2, 2), tiles, 1000);
  const r2 = solve(board(2, 2), tiles, 1000);
  assert.equal(r1.status, "solved");
  assert.deepEqual(r1.solution, [["A", "A"], ["A", "A"]]);
  assert.deepEqual(r1.solution, r2.solution);
});

test("固定格冲突：两个相邻固定块边色不一致", () => {
  const tiles = [tile("A", "x", "p", "x", "x"), tile("B", "x", "x", "x", "q")];
  const b = board(2, 1, { fixed: [{ row: 0, col: 0, tileId: "A" }, { row: 0, col: 1, tileId: "B" }] });
  const r = solve(b, tiles, 100);
  assert.equal(r.status, "unsat");
});

test("固定格被尊重且方案确定", () => {
  const tiles = [tile("A", "x", "x", "x", "x"), tile("B", "x", "x", "x", "x")];
  const b = board(2, 2, { fixed: [{ row: 1, col: 1, tileId: "B" }] });
  const r = solve(b, tiles, 1000);
  assert.equal(r.status, "solved");
  assert.equal(r.solution![1][1], "B");
});

test("无方块：校验拒绝空方块集", () => {
  assert.throws(() => validateTiles([]), (e) => e instanceof ApiError && e.code === "TILES_EMPTY");
});

test("预算边界：预算耗尽返回 unknown 而非 unsat", () => {
  const tiles = [
    tile("T1", "a", "b", "c", "d"),
    tile("T2", "b", "c", "d", "a"),
    tile("T3", "c", "d", "a", "b"),
  ];
  const r = solve(board(4, 4), tiles, 3);
  assert.equal(r.status, "unknown");
  assert.equal(r.nodesVisited, 3);
  assert.match(r.stopReason, /预算/);
});

test("预算恰好足够时仍可 solved", () => {
  const tiles = [tile("A", "x", "x", "x", "x")];
  const r = solve(board(2, 2), tiles, 4);
  assert.equal(r.status, "solved");
  assert.equal(r.nodesVisited, 4);
});

test("输入校验：重复编号、越界固定、重复固定、边界长度", () => {
  assert.throws(() => validateTiles([{ id: "A", top: "x", right: "x", bottom: "x", left: "x" }, { id: "A", top: "y", right: "y", bottom: "y", left: "y" }]), /重复/);
  assert.throws(() => validateFixed([{ row: 5, col: 0, tileId: "A" }], 2, 2, new Set(["A"])), /越界/);
  assert.throws(() => validateFixed([{ row: 0, col: 0, tileId: "A" }, { row: 0, col: 0, tileId: "A" }], 2, 2, new Set(["A"])), /重复固定/);
  assert.throws(() => validateFixed([{ row: 0, col: 0, tileId: "ZZ" }], 2, 2, new Set(["A"])), /不存在/);
  assert.throws(() => validateBoundary({ top: ["x"], right: [], bottom: [], left: [] }, 2, 2), /长度/);
  assert.throws(() => validateBoardDims(9, 1), /每维/);
  assert.throws(() => validateBoardDims(8, 8), /总格数/);
});

test("独立核验：篡改一格后定位实际冲突", () => {
  const tiles = [tile("A", "x", "p", "x", "x"), tile("B", "x", "q", "x", "p")];
  const b = board(2, 1);
  const good = solve(b, tiles, 100);
  assert.equal(good.status, "solved");
  assert.equal(verifyCandidate(b, tiles, good.solution).length, 0);
  const tampered = [["A", "A"]];
  const violations = verifyCandidate(b, tiles, tampered);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, "neighbor_mismatch");
  assert.deepEqual(violations[0].cell, [0, 0]);
  assert.deepEqual(violations[0].otherCell, [0, 1]);
});

test("基准对照：小网格暴力枚举与搜索结论一致", () => {
  const tiles = [tile("A", "x", "p", "x", "q"), tile("B", "x", "q", "x", "p"), tile("C", "y", "p", "y", "p")];
  const cases: Array<[number, number, BoardInput["boundary"]?]> = [
    [1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [2, 3],
  ];
  for (const [w, h] of cases) {
    const b = board(w, h);
    const r = solve(b, tiles, 100000);
    // 暴力枚举所有编号排列
    const ids = tiles.map((t) => t.id);
    let bruteSolved = false;
    const total = w * h;
    const combo: string[] = new Array(total);
    const enumerate = (i: number) => {
      if (bruteSolved) return;
      if (i === total) {
        const grid: string[][] = [];
        for (let rr = 0; rr < h; rr++) grid.push(combo.slice(rr * w, (rr + 1) * w));
        if (verifyCandidate(b, tiles, grid).length === 0) bruteSolved = true;
        return;
      }
      for (const id of ids) {
        combo[i] = id;
        enumerate(i + 1);
      }
    };
    enumerate(0);
    const expect = bruteSolved ? "solved" : "unsat";
    assert.equal(r.status, expect, `${w}x${h} 期望 ${expect}`);
    if (r.solution) assert.equal(verifyCandidate(b, tiles, r.solution).length, 0);
  }
});
