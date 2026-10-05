import type { BoardInput, Tile, Violation } from "./types.js";

/**
 * 独立核验候选方案：只依据棋盘输入与方块定义逐格、逐边检查，
 * 不依赖搜索器的任何状态或成功标志。
 */
export function verifyCandidate(board: BoardInput, tiles: Tile[], grid: unknown): Violation[] {
  const { width, height, boundary, fixed } = board;
  const violations: Violation[] = [];
  const tilesById = new Map(tiles.map((t) => [t.id, t]));

  if (!Array.isArray(grid) || grid.length !== height || grid.some((row) => !Array.isArray(row) || row.length !== width)) {
    violations.push({ kind: "grid_shape", detail: `方案应为 ${height}x${width} 的编号矩阵` });
    return violations;
  }
  const g = grid as string[][];

  const placed: (Tile | null)[][] = g.map((row, r) =>
    row.map((id, c) => {
      if (typeof id !== "string" || !tilesById.has(id)) {
        violations.push({ kind: "unknown_tile", detail: `格子 (${r},${c}) 编号不存在: ${String(id)}`, cell: [r, c] });
        return null;
      }
      return tilesById.get(id)!;
    }),
  );

  for (const f of fixed) {
    if (g[f.row][f.col] !== f.tileId) {
      violations.push({
        kind: "fixed_mismatch",
        detail: `格子 (${f.row},${f.col}) 应固定为 ${f.tileId}，实际为 ${g[f.row][f.col]}`,
        cell: [f.row, f.col],
        expected: f.tileId,
        actual: g[f.row][f.col],
      });
    }
  }

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const t = placed[r][c];
      if (!t) continue;
      const checkBoundary = (side: "top" | "right" | "bottom" | "left", expected: string | null, actual: string, pos: string) => {
        if (expected !== null && expected !== actual) {
          violations.push({
            kind: "boundary_mismatch",
            detail: `格子 (${r},${c}) ${pos}要求颜色 ${expected}，实际 ${actual}`,
            cell: [r, c],
            side,
            expected,
            actual,
          });
        }
      };
      if (r === 0) checkBoundary("top", boundary.top[c], t.top, "上边界 ");
      if (r === height - 1) checkBoundary("bottom", boundary.bottom[c], t.bottom, "下边界 ");
      if (c === 0) checkBoundary("left", boundary.left[r], t.left, "左边界 ");
      if (c === width - 1) checkBoundary("right", boundary.right[r], t.right, "右边界 ");

      if (c + 1 < width) {
        const right = placed[r][c + 1];
        if (right && t.right !== right.left) {
          violations.push({
            kind: "neighbor_mismatch",
            detail: `格子 (${r},${c}) 右边 ${t.right} 与格子 (${r},${c + 1}) 左边 ${right.left} 不一致`,
            cell: [r, c],
            otherCell: [r, c + 1],
            side: "right",
            expected: t.right,
            actual: right.left,
          });
        }
      }
      if (r + 1 < height) {
        const down = placed[r + 1][c];
        if (down && t.bottom !== down.top) {
          violations.push({
            kind: "neighbor_mismatch",
            detail: `格子 (${r},${c}) 下边 ${t.bottom} 与格子 (${r + 1},${c}) 上边 ${down.top} 不一致`,
            cell: [r, c],
            otherCell: [r + 1, c],
            side: "bottom",
            expected: t.bottom,
            actual: down.top,
          });
        }
      }
    }
  }
  return violations;
}
