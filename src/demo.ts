import { Store } from "./store.js";
import { WangService } from "./service.js";
import { unconstrainedBoundary } from "./validate.js";

const service = new WangService(new Store(":memory:"));

function scenario(name: string, fn: () => void) {
  console.log(`\n=== ${name} ===`);
  fn();
}

function mkBoard(tilesetId: string, width: number, height: number, extra: Record<string, unknown> = {}) {
  return service.createBoard({ tilesetId, width, height, ...extra });
}

function run(boardId: string, maxNodes?: number) {
  const r = service.runSearch(boardId, maxNodes);
  console.log(`状态: ${r.status} | 节点 ${r.nodesVisited} | 回溯 ${r.backtracks} | ${r.stopReason}`);
  if (r.solution) {
    for (const row of r.solution) console.log("  " + row.join(" "));
    const v = service.verify(boardId, r.solution);
    console.log(`独立核验: ${v.ok ? "通过" : "失败 " + JSON.stringify(v.violations)}`);
  }
  return r;
}

// 1. 单色方块可无限复用，拼满 3x3
scenario("单色可重复拼满 3x3", () => {
  const ts = service.createTileset({ tiles: [{ id: "A", top: "R", right: "R", bottom: "R", left: "R" }] });
  run(mkBoard(ts.id, 3, 3).id);
});

// 2. 双色必须交替（棋盘格 4x4）
scenario("双色交替 4x4", () => {
  const ts = service.createTileset({
    tiles: [
      { id: "X", top: "a", right: "p", bottom: "a", left: "q" },
      { id: "Y", top: "a", right: "q", bottom: "a", left: "p" },
    ],
  });
  run(mkBoard(ts.id, 4, 4).id);
});

// 3. 外边限制导致无解：要求某格外边颜色不存在于任何方块
scenario("外边限制导致无解 2x2", () => {
  const ts = service.createTileset({ tiles: [{ id: "A", top: "R", right: "R", bottom: "R", left: "R" }] });
  const boundary = unconstrainedBoundary(2, 2);
  boundary.top = ["B", null];
  const board = mkBoard(ts.id, 2, 2, { boundary });
  const r = run(board.id);
  console.log(`解释前几条: ${JSON.stringify(r.trace.slice(0, 3), null, 2)}`);
});

// 4. 很小预算下结果未确定
scenario("预算不足导致未确定 4x4", () => {
  const ts = service.createTileset({
    tiles: [
      { id: "T1", top: "a", right: "b", bottom: "c", left: "d" },
      { id: "T2", top: "b", right: "c", bottom: "d", left: "a" },
      { id: "T3", top: "c", right: "d", bottom: "a", left: "b" },
      { id: "T4", top: "d", right: "a", bottom: "b", left: "c" },
    ],
  });
  const board = mkBoard(ts.id, 4, 4);
  const r = run(board.id, 5);
  console.log(`（预算 5 节点耗尽即返回 unknown，不代表无解）`);
});
