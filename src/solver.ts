import { BoardInput, ExplainEvent, Side, SolveOptions, SolveResult, Tile } from './types';

/**
 * 直观回溯搜索（自行实现，不依赖 SAT / 约束求解库）。
 *
 * 稳定性约定：
 *  - 格子顺序固定为行优先 (r 从小到大, c 从小到大)；
 *  - 每格候选按方块集合中的原始顺序枚举（调用方负责排序/去重后的稳定序列）；
 *  - 方块可无限复用，已放置方块不会从候选中移除。
 *
 * 预算口径：每尝试放置一个候选记一次 visitedNodes；
 * 预算耗尽立即停止并返回 budget（未确定），绝不宣称无解。
 */

const OPPOSITE: Record<Side, Side> = { N: 'S', E: 'W', S: 'N', W: 'E' };

type RejectCause = NonNullable<ExplainEvent['reason']>;

export function solve(tiles: Tile[], board: BoardInput, options: SolveOptions): SolveResult {
  const { rows, cols, borders, fixed } = board;
  const total = rows * cols;
  const grid: (Tile | null)[][] = Array.from({ length: rows }, () =>
    new Array<Tile | null>(cols).fill(null),
  );

  const fixedAt = new Map<number, Tile>();
  for (const [key, id] of Object.entries(fixed)) {
    const [r, c] = key.split(',').map(Number);
    const tile = tiles.find((t) => t.id === id);
    if (!tile) {
      // 固定编号非法属于调用前应拦截的结构错误；到这里视为立即无解并给出诊断。
      return {
        status: 'unsatisfiable',
        solution: null,
        visitedNodes: 0,
        backtracks: 0,
        rejectedCandidates: 0,
        explanation: [
          {
            depth: 0,
            cell: [r, c],
            kind: 'reject',
            tileId: id,
            reason: { type: 'fixed', fixedId: id },
          },
        ],
        explanationTruncated: false,
        budget: options.budget,
      };
    }
    fixedAt.set(r * cols + c, tile);
  }

  const explanation: ExplainEvent[] = [];
  let truncated = false;
  let visitedNodes = 0;
  let backtracks = 0;
  let rejectedCandidates = 0;
  let budgetExhausted = false;

  function pushEvent(ev: ExplainEvent): void {
    if (explanation.length < options.explainLimit) {
      explanation.push(ev);
    } else {
      truncated = true;
    }
  }

  /** 返回该格放置 tile 被拒绝的首个原因；null 表示当前局部合法。 */
  function rejectionCause(
    r: number,
    c: number,
    tile: Tile,
  ): Exclude<ExplainEvent['reason'], undefined> | null {
    // 上邻格
    if (r > 0) {
      const up = grid[r - 1][c];
      if (up && up.S !== tile.N) {
        return {
          type: 'neighbor',
          side: 'N',
          neighbor: [r - 1, c],
          required: up.S,
          actual: tile.N,
        };
      }
    } else if (borders.top[c] !== null && borders.top[c] !== tile.N) {
      return { type: 'border', side: 'N', required: borders.top[c] as string, actual: tile.N };
    }

    // 左邻格
    if (c > 0) {
      const left = grid[r][c - 1];
      if (left && left.E !== tile.W) {
        return {
          type: 'neighbor',
          side: 'W',
          neighbor: [r, c - 1],
          required: left.E,
          actual: tile.W,
        };
      }
    } else if (borders.left[r] !== null && borders.left[r] !== tile.W) {
      return { type: 'border', side: 'W', required: borders.left[r] as string, actual: tile.W };
    }

    // 下邻格（可能已有回溯后放置的格子；行优先下通常为空，仍完整检查）
    if (r < rows - 1) {
      const down = grid[r + 1][c];
      if (down && down.N !== tile.S) {
        return {
          type: 'neighbor',
          side: 'S',
          neighbor: [r + 1, c],
          required: down.N,
          actual: tile.S,
        };
      }
    } else if (borders.bottom[c] !== null && borders.bottom[c] !== tile.S) {
      return { type: 'border', side: 'S', required: borders.bottom[c] as string, actual: tile.S };
    }

    // 右邻格
    if (c < cols - 1) {
      const right = grid[r][c + 1];
      if (right && right.W !== tile.E) {
        return {
          type: 'neighbor',
          side: 'E',
          neighbor: [r, c + 1],
          required: right.W,
          actual: tile.E,
        };
      }
    } else if (borders.right[r] !== null && borders.right[r] !== tile.E) {
      return { type: 'border', side: 'E', required: borders.right[r] as string, actual: tile.E };
    }

    return null;
  }

  function dfs(index: number): boolean {
    if (budgetExhausted) {
      return false;
    }
    if (index === total) {
      return true;
    }
    const r = Math.floor(index / cols);
    const c = index % cols;
    const depth = index;

    let candidates: Tile[];
    const forced = fixedAt.get(index);
    if (forced) {
      candidates = [forced];
    } else {
      candidates = tiles;
    }

    let attempted = 0;
    for (const tile of candidates) {
      visitedNodes += 1;
      if (visitedNodes > options.budget) {
        budgetExhausted = true;
        return false;
      }
      attempted += 1;
      const cause = rejectionCause(r, c, tile);
      if (cause) {
        rejectedCandidates += 1;
        pushEvent({ depth, cell: [r, c], kind: 'reject', tileId: tile.id, reason: cause });
        continue;
      }

      grid[r][c] = tile;
      pushEvent({ depth, cell: [r, c], kind: 'place', tileId: tile.id });
      if (dfs(index + 1)) {
        return true;
      }
      if (budgetExhausted) {
        return false;
      }
      grid[r][c] = null;
      backtracks += 1;
      pushEvent({ depth, cell: [r, c], kind: 'backtrack', tileId: tile.id });
    }

    if (attempted === 0) {
      pushEvent({ depth, cell: [r, c], kind: 'reject', reason: { type: 'no-candidates' } });
    } else {
      pushEvent({ depth, cell: [r, c], kind: 'reject', reason: { type: 'no-candidates' } });
    }
    return false;
  }

  const found = dfs(0);

  if (found) {
    const solution = grid.map((row) => row.map((t) => (t as Tile).id));
    return {
      status: 'solved',
      solution,
      visitedNodes,
      backtracks,
      rejectedCandidates,
      explanation,
      explanationTruncated: truncated,
      budget: options.budget,
    };
  }

  return {
    status: budgetExhausted ? 'budget' : 'unsatisfiable',
    solution: null,
    visitedNodes,
    backtracks,
    rejectedCandidates,
    explanation,
    explanationTruncated: truncated,
    budget: options.budget,
  };
}

export { OPPOSITE };
