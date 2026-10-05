import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../solver';
import { verifySolution } from '../verify';
import { validateTiles } from '../validation';
import { BoardInput, Tile } from '../types';
import { bruteForceSolvable, mulberry32 } from './oracle';

function freeBorders(rows: number, cols: number): BoardInput['borders'] {
  return {
    top: new Array(cols).fill(null),
    right: new Array(rows).fill(null),
    bottom: new Array(cols).fill(null),
    left: new Array(rows).fill(null),
  };
}

function board(rows: number, cols: number, fixed: Record<string, string> = {}, borders = freeBorders(rows, cols)): BoardInput {
  return { rows, cols, borders, fixed };
}

const opts = { budget: 100_000, explainLimit: 500 };

test('一格棋盘：单色方块成功并通过独立核验', () => {
  const tiles = validateTiles([{ id: 'M', N: 'r', E: 'r', S: 'r', W: 'r' }]);
  const res = solve(tiles, board(1, 1), opts);
  assert.equal(res.status, 'solved');
  assert.deepEqual(res.solution, [['M']]);
  assert.equal(verifySolution(tiles, board(1, 1), res.solution).valid, true);
});

test('单行：相邻左右边一致即可', () => {
  const tiles = validateTiles([
    { id: 'L', N: 'r', E: 'g', S: 'r', W: 'r' },
    { id: 'R', N: 'r', E: 'r', S: 'r', W: 'g' },
  ]);
  const res = solve(tiles, board(1, 3), opts);
  assert.equal(res.status, 'solved');
  // L.E=g 接 R.W=g；R.E=r 接 L.W=r，故序列为 L R L
  assert.deepEqual(res.solution, [['L', 'R', 'L']]);
  assert.equal(verifySolution(tiles, board(1, 3), res.solution).valid, true);
});

test('单列：只在竖向发生的冲突会被发现并回溯', () => {
  // 上块下边为 g，候选中只有 U 下边 g / D 上边 g 能相接；
  // 构造一个首候选竖向不兼容，确保走到下边约束。
  const tiles: Tile[] = [
    { id: 'X', N: 'r', E: 'r', S: 'r', W: 'r' }, // 上下都是 r
    { id: 'D', N: 'g', E: 'r', S: 'r', W: 'r' }, // 上边 g
  ];
  const withTop: Tile[] = [
    { id: 'U', N: 'r', E: 'r', S: 'g', W: 'r' }, // 下边 g
    ...tiles,
  ];
  const res = solve(withTop, board(2, 1), opts);
  assert.equal(res.status, 'solved');
  assert.deepEqual(res.solution, [['U'], ['D']]);
  // 排除集合里若只有 X（r/r 相接其实可解）。再做一个纯竖向无解棋盘：
  const onlyX = validateTiles([{ id: 'X', N: 'r', E: 'r', S: 'r', W: 'r' }]);
  const impossible = board(2, 1, {}, {
    top: [null], right: [null, null], bottom: ['g'], left: [null, null],
  });
  const res2 = solve(onlyX, impossible, opts);
  assert.equal(res2.status, 'unsatisfiable');
  assert.ok(res2.explanation.some((e) => e.reason?.type === 'border' && e.reason.side === 'S'));
});

test('相同四边但不同编号：稳定选择编号最小序（集合顺序首个）', () => {
  const tiles = validateTiles([
    { id: 't1', N: 'a', E: 'a', S: 'a', W: 'a' },
    { id: 't2', N: 'a', E: 'a', S: 'a', W: 'a' },
  ]);
  const a = solve(tiles, board(2, 2), opts);
  const b = solve(tiles, board(2, 2), opts);
  assert.deepEqual(a.solution, b.solution);
  assert.deepEqual(a.solution, [['t1', 't1'], ['t1', 't1']]);
});

test('固定格冲突：固定一个与边界冲突的编号 => 无解并给出原因', () => {
  const tiles = validateTiles([{ id: 'M', N: 'r', E: 'r', S: 'r', W: 'r' }]);
  const b: BoardInput = {
    rows: 1,
    cols: 1,
    borders: { top: ['b'], right: [null], bottom: [null], left: [null] },
    fixed: { '0,0': 'M' },
  };
  const res = solve(tiles, b, opts);
  assert.equal(res.status, 'unsatisfiable');
  assert.ok(res.explanation.some((e) => e.reason?.type === 'border'));
});

test('外边限制导致无解：1x1 四边颜色组合无方块满足', () => {
  const tiles = validateTiles([{ id: 'X', N: 'b', E: 'b', S: 'b', W: 'b' }]);
  const b: BoardInput = {
    rows: 1,
    cols: 1,
    borders: { top: ['b'], right: ['b'], bottom: ['b'], left: ['w'] },
    fixed: {},
  };
  const res = solve(tiles, b, opts);
  assert.equal(res.status, 'unsatisfiable');
});

test('预算边界：budget=1 时 2x2 必须未确定而不是无解', () => {
  const tiles = validateTiles([
    { id: 'A', N: 'b', E: 'w', S: 'w', W: 'b' },
    { id: 'B', N: 'w', E: 'b', S: 'b', W: 'w' },
  ]);
  const res = solve(tiles, board(2, 2, { '0,0': 'A' }), { ...opts, budget: 1 });
  assert.equal(res.status, 'budget');
  assert.equal(res.solution, null);
  // 预算充足时确实可解
  const full = solve(tiles, board(2, 2, { '0,0': 'A' }), opts);
  assert.equal(full.status, 'solved');
});

test('无方块：任何非空棋盘都无解', () => {
  const tiles: Tile[] = [];
  const res = solve(tiles, board(1, 1), opts);
  assert.equal(res.status, 'unsatisfiable');
  assert.equal(res.solution, null);
});

test('确定性：相同输入多次运行结果完全一致', () => {
  const tiles = validateTiles([
    { id: 'A', N: 'b', E: 'w', S: 'w', W: 'b' },
    { id: 'B', N: 'w', E: 'b', S: 'b', W: 'w' },
    { id: 'C', N: 'b', E: 'b', S: 'w', W: 'w' },
  ]);
  const runs = Array.from({ length: 5 }, () => solve(tiles, board(2, 3), opts));
  for (const r of runs) {
    assert.deepEqual(r.solution, runs[0].solution);
    assert.equal(r.visitedNodes, runs[0].visitedNodes);
  }
  assert.equal(verifySolution(tiles, board(2, 3), runs[0].solution).valid, true);
});

test('篡改一格：独立核验定位到实际冲突邻边', () => {
  const tiles = validateTiles([
    { id: 'A', N: 'b', E: 'w', S: 'w', W: 'b' },
    { id: 'B', N: 'w', E: 'b', S: 'b', W: 'w' },
  ]);
  const res = solve(tiles, board(2, 2, { '0,0': 'A' }), opts);
  assert.equal(res.status, 'solved');
  const matrix = res.solution!.map((row) => [...row]);
  // 把右下角改成不兼容方块
  matrix[1][1] = matrix[1][1] === 'A' ? 'B' : 'A';
  const report = verifySolution(tiles, board(2, 2, { '0,0': 'A' }), matrix);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.kind === 'edge-mismatch' && i.cell[0] === 1 && i.cell[1] === 1));
});

test('交叉基准：随机小网格回溯器结论与全枚举一致', () => {
  const palette = ['r', 'g', 'b'];
  const rand = mulberry32(42);
  const tilePool: Tile[] = Array.from({ length: 6 }, (_, i) => ({
    id: `T${i}`,
    N: palette[Math.floor(rand() * 3)],
    E: palette[Math.floor(rand() * 3)],
    S: palette[Math.floor(rand() * 3)],
    W: palette[Math.floor(rand() * 3)],
  }));
  const shapes: Array<[number, number]> = [[1, 1], [1, 2], [2, 1], [2, 2]];
  let checks = 0;
  for (const [rows, cols] of shapes) {
    // 全枚举规模 <= 2^4
    const tiles = tilePool.slice(0, 2);
    const b = board(rows, cols);
    const res = solve(tiles, b, opts);
    const oracle = bruteForceSolvable(tiles, b);
    assert.equal(res.status === 'solved', oracle, `${rows}x${cols} 与基准不一致`);
    if (res.solution) {
      assert.equal(verifySolution(tiles, b, res.solution).valid, true);
    }
    checks += 1;
  }
  assert.ok(checks >= 4);
});

test('交叉基准：随机颜色棋盘（含无解）与全枚举一致', () => {
  const rand = mulberry32(7);
  for (let iter = 0; iter < 40; iter++) {
    const tiles: Tile[] = Array.from({ length: 2 }, (_, i) => ({
      id: `X${i}`,
      N: rand() < 0.5 ? 'r' : 'g',
      E: rand() < 0.5 ? 'r' : 'g',
      S: rand() < 0.5 ? 'r' : 'g',
      W: rand() < 0.5 ? 'r' : 'g',
    }));
    const b = board(2, 2);
    const res = solve(tiles, b, opts);
    assert.equal(res.status === 'solved', bruteForceSolvable(tiles, b));
  }
});

test('解释事件：被排除候选携带邻格或外边诊断', () => {
  const tiles = validateTiles([
    { id: 'A', N: 'b', E: 'w', S: 'w', W: 'b' },
    { id: 'B', N: 'w', E: 'b', S: 'b', W: 'w' },
  ]);
  const b: BoardInput = {
    rows: 1,
    cols: 2,
    borders: freeBorders(1, 2),
    fixed: { '0,0': 'A' }, // A 的右边是 w；候选 A(W=b) 先被拒，B(W=w) 成功
  };
  const res = solve(tiles, b, opts);
  assert.equal(res.status, 'solved');
  assert.ok(res.rejectedCandidates >= 1);
  assert.ok(
    res.explanation.some(
      (e) => e.kind === 'reject' && e.reason?.type === 'neighbor' && e.tileId === 'A',
    ),
  );
});
