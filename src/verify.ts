import { BoardInput, Tile, VerificationIssue, VerificationReport } from './types';
import { invalid } from './errors';

/**
 * 独立核验：完全不信任搜索器的成功标志，
 * 只依据每格编号、固定条件、外边和全部相邻边重新检查。
 * matrix 为 rows x cols 的方块编号矩阵。
 */
export function verifySolution(
  tiles: Tile[],
  board: BoardInput,
  matrix: unknown,
): VerificationReport {
  const { rows, cols, borders, fixed } = board;
  const issues: VerificationIssue[] = [];
  let checkedEdges = 0;
  let checkedBorders = 0;

  if (!Array.isArray(matrix) || matrix.length !== rows) {
    throw invalid('solution 必须是与棋盘行数相同的数组');
  }

  const byId = new Map<string, Tile>();
  for (const t of tiles) {
    byId.set(t.id, t);
  }

  const placed: (Tile | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowRaw = (matrix as unknown[])[r];
    if (!Array.isArray(rowRaw) || rowRaw.length !== cols) {
      throw invalid(`solution 第 ${r} 行长度必须等于 cols=${cols}`);
    }
    const row: (Tile | null)[] = [];
    for (let c = 0; c < cols; c++) {
      const id = rowRaw[c];
      if (typeof id !== 'string' || id.length === 0) {
        issues.push({
          cell: [r, c],
          kind: 'missing-cell',
          message: `格子 (${r},${c}) 缺少方块编号`,
        });
        row.push(null);
        continue;
      }
      const tile = byId.get(id);
      if (!tile) {
        issues.push({
          cell: [r, c],
          kind: 'unknown-tile',
          actual: id,
          message: `格子 (${r},${c}) 使用了方块集合中不存在的编号 ${id}`,
        });
        row.push(null);
        continue;
      }
      const fixedId = fixed[`${r},${c}`];
      if (fixedId !== undefined && fixedId !== id) {
        issues.push({
          cell: [r, c],
          kind: 'fixed-mismatch',
          expected: fixedId,
          actual: id,
          message: `格子 (${r},${c}) 被固定为 ${fixedId}，但方案放置 ${id}`,
        });
      }
      row.push(tile);
    }
    placed.push(row);
  }

  // 邻边：每对相邻格子检查一次（横向 + 纵向），确保不漏掉上下边。
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = placed[r][c];
      if (!tile) {
        continue;
      }
      // 与左邻
      if (c > 0) {
        checkedEdges += 1;
        const left = placed[r][c - 1];
        if (left && left.E !== tile.W) {
          issues.push({
            cell: [r, c],
            kind: 'edge-mismatch',
            side: 'W',
            neighbor: [r, c - 1],
            expected: left.E,
            actual: tile.W,
            message: `(${r},${c}) 左边 "${tile.W}" 与左邻 (${r},${c - 1}) 右边 "${left.E}" 不一致`,
          });
        }
      }
      // 与上邻
      if (r > 0) {
        checkedEdges += 1;
        const up = placed[r - 1][c];
        if (up && up.S !== tile.N) {
          issues.push({
            cell: [r, c],
            kind: 'edge-mismatch',
            side: 'N',
            neighbor: [r - 1, c],
            expected: up.S,
            actual: tile.N,
            message: `(${r},${c}) 上边 "${tile.N}" 与上邻 (${r - 1},${c}) 下边 "${up.S}" 不一致`,
          });
        }
      }

      // 外边（仅约束位置；null 表示不约束，不参与比较）
      if (r === 0 && borders.top[c] !== null) {
        checkedBorders += 1;
        if (tile.N !== borders.top[c]) {
          issues.push({
            cell: [r, c],
            kind: 'border-mismatch',
            side: 'N',
            expected: borders.top[c] as string,
            actual: tile.N,
            message: `(${r},${c}) 上边 "${tile.N}" 不满足外边要求 "${borders.top[c]}"`,
          });
        }
      }
      if (r === rows - 1 && borders.bottom[c] !== null) {
        checkedBorders += 1;
        if (tile.S !== borders.bottom[c]) {
          issues.push({
            cell: [r, c],
            kind: 'border-mismatch',
            side: 'S',
            expected: borders.bottom[c] as string,
            actual: tile.S,
            message: `(${r},${c}) 下边 "${tile.S}" 不满足外边要求 "${borders.bottom[c]}"`,
          });
        }
      }
      if (c === 0 && borders.left[r] !== null) {
        checkedBorders += 1;
        if (tile.W !== borders.left[r]) {
          issues.push({
            cell: [r, c],
            kind: 'border-mismatch',
            side: 'W',
            expected: borders.left[r] as string,
            actual: tile.W,
            message: `(${r},${c}) 左边 "${tile.W}" 不满足外边要求 "${borders.left[r]}"`,
          });
        }
      }
      if (c === cols - 1 && borders.right[r] !== null) {
        checkedBorders += 1;
        if (tile.E !== borders.right[r]) {
          issues.push({
            cell: [r, c],
            kind: 'border-mismatch',
            side: 'E',
            expected: borders.right[r] as string,
            actual: tile.E,
            message: `(${r},${c}) 右边 "${tile.E}" 不满足外边要求 "${borders.right[r]}"`,
          });
        }
      }
    }
  }

  return { valid: issues.length === 0, issues, checkedEdges, checkedBorders };
}
