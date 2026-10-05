import type { BoardInput, SearchReport, SearchStatus, Tile, TraceEntry } from "./types.js";

const TRACE_LIMIT = 200;

export interface SolveResult {
  status: SearchStatus;
  nodesVisited: number;
  backtracks: number;
  stopReason: string;
  solution: string[][] | null;
  trace: TraceEntry[];
  traceTruncated: boolean;
}

/** 检查放在 (r,c) 的方块与已放置邻居及外边是否冲突；返回冲突原因或 null */
function conflictReason(
  board: BoardInput,
  tilesById: Map<string, Tile>,
  grid: (Tile | null)[][],
  r: number,
  c: number,
  tile: Tile,
): string | null {
  const { width, height, boundary } = board;
  if (r > 0) {
    const up = grid[r - 1][c];
    if (up && up.bottom !== tile.top)
      return `与上方格子 (${r - 1},${c}) 方块 ${up.id} 的下边颜色 ${up.bottom} 不一致（本块上边 ${tile.top}）`;
  }
  if (c > 0) {
    const left = grid[r][c - 1];
    if (left && left.right !== tile.left)
      return `与左方格子 (${r},${c - 1}) 方块 ${left.id} 的右边颜色 ${left.right} 不一致（本块左边 ${tile.left}）`;
  }
  if (r === 0 && boundary.top[c] !== null && boundary.top[c] !== tile.top)
    return `不满足上边界 (${0},${c}) 要求颜色 ${boundary.top[c]}（本块上边 ${tile.top}）`;
  if (r === height - 1 && boundary.bottom[c] !== null && boundary.bottom[c] !== tile.bottom)
    return `不满足下边界 (${height - 1},${c}) 要求颜色 ${boundary.bottom[c]}（本块下边 ${tile.bottom}）`;
  if (c === 0 && boundary.left[r] !== null && boundary.left[r] !== tile.left)
    return `不满足左边界 (${r},${0}) 要求颜色 ${boundary.left[r]}（本块左边 ${tile.left}）`;
  if (c === width - 1 && boundary.right[r] !== null && boundary.right[r] !== tile.right)
    return `不满足右边界 (${r},${width - 1}) 要求颜色 ${boundary.right[r]}（本块右边 ${tile.right}）`;
  return null;
}

/**
 * 确定性回溯搜索：行优先顺序逐格放置，候选方块按编号字典序。
 * budget 为候选尝试（节点访问）次数上限；耗尽返回 unknown，完整穷尽返回 unsat。
 */
export function solve(board: BoardInput, tiles: Tile[], budget: number): SolveResult {
  const { width, height, fixed } = board;
  const tilesById = new Map(tiles.map((t) => [t.id, t]));
  const candidates = [...tiles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const grid: (Tile | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
  const fixedAt = new Map<string, Tile>();
  for (const f of fixed) fixedAt.set(`${f.row},${f.col}`, tilesById.get(f.tileId)!);

  let nodes = 0;
  let backtracks = 0;
  let budgetHit = false;
  const trace: TraceEntry[] = [];
  let traceTruncated = false;

  const pushTrace = (entry: TraceEntry) => {
    if (trace.length < TRACE_LIMIT) trace.push(entry);
    else traceTruncated = true;
  };

  const total = width * height;

  const place = (idx: number): boolean => {
    if (idx === total) return true;
    const r = Math.floor(idx / width);
    const c = idx % width;
    const forced = fixedAt.get(`${r},${c}`);
    const options = forced ? [forced] : candidates;
    let anyTried = false;
    for (const tile of options) {
      if (nodes >= budget) {
        budgetHit = true;
        return false;
      }
      nodes++;
      anyTried = true;
      const reason = conflictReason(board, tilesById, grid, r, c, tile);
      if (reason !== null) {
        pushTrace({ node: nodes, cell: [r, c], tileId: tile.id, action: "reject", reason });
        continue;
      }
      grid[r][c] = tile;
      if (place(idx + 1)) return true;
      grid[r][c] = null;
      if (budgetHit) return false;
    }
    if (anyTried || options.length > 0) {
      backtracks++;
      pushTrace({
        node: nodes,
        cell: [r, c],
        tileId: forced ? forced.id : "-",
        action: "backtrack",
        reason: forced
          ? `固定方块 ${forced.id} 在 (${r},${c}) 无可行延伸，回溯`
          : `格子 (${r},${c}) 所有候选均被排除，回溯`,
      });
    }
    return false;
  };

  const solved = place(0);
  let status: SearchStatus;
  let stopReason: string;
  if (solved) {
    status = "solved";
    stopReason = "找到合法拼法";
  } else if (budgetHit) {
    status = "unknown";
    stopReason = `搜索预算 ${budget} 个节点耗尽，结果未确定`;
  } else {
    status = "unsat";
    stopReason = "搜索空间已完整穷尽，确认无解";
  }
  const solution = solved ? grid.map((row) => row.map((t) => t!.id)) : null;
  return { status, nodesVisited: nodes, backtracks, stopReason, solution, trace, traceTruncated };
}
