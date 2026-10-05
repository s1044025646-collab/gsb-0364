import { BoardInput, ExplainEvent, SolveResult, Tile, VerificationReport } from './types';

/** 把方案渲染为方块编号矩阵的可读文本（等宽对齐）。 */
export function renderIdMatrix(matrix: string[][]): string {
  const width = Math.max(2, ...matrix.flat().map((id) => id.length));
  const lines = matrix.map((row) =>
    row.map((id) => id.padEnd(width, ' ')).join(' | '),
  );
  const sep = '-'.repeat(lines[0]?.length ?? 0);
  return [`方块编号矩阵（行优先，N上 E右 S下 W左）：`, sep, ...lines, sep].join('\n');
}

/** 边色诊断表：逐格列出 N/E/S/W 与固定/邻接情况。 */
export function renderEdgeTable(
  tiles: Tile[],
  board: BoardInput,
  matrix: string[][] | null,
): string {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const { rows, cols, borders } = board;
  const out: string[] = [];
  out.push('边色诊断表：');
  out.push('格子      编号    N(上)   E(右)   S(下)   W(左)   外边约束');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = matrix ? matrix[r][c] : board.fixed[`${r},${c}`] ?? '-';
      const tile = id ? byId.get(id) : undefined;
      const edges = tile
        ? [tile.N, tile.E, tile.S, tile.W].map((x) => x.padEnd(6)).join(' ')
        : ['?', '?', '?', '?'].map((x) => x.padEnd(6)).join(' ');
      const outside = [
        r === 0 ? `N=${borders.top[c] ?? '*'}` : null,
        c === cols - 1 ? `E=${borders.right[r] ?? '*'}` : null,
        r === rows - 1 ? `S=${borders.bottom[c] ?? '*'}` : null,
        c === 0 ? `W=${borders.left[r] ?? '*'}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      out.push(`(${r},${c})`.padEnd(9) + id.padEnd(7) + edges + ' ' + outside);
    }
  }
  out.push('（* 表示该外边不约束）');
  return out.join('\n');
}

export function renderVerification(report: VerificationReport): string {
  const head = report.valid
    ? `核验通过：检查邻边 ${report.checkedEdges} 对、外边 ${report.checkedBorders} 处，未发现冲突。`
    : `核验未通过：发现 ${report.issues.length} 个问题（邻边 ${report.checkedEdges} 对，外边 ${report.checkedBorders} 处）：`;
  const body = report.issues.map((iss) => `  - [${iss.kind}] ${iss.message}`).join('\n');
  return report.issues.length ? `${head}\n${body}` : head;
}

export function renderResultSummary(result: SolveResult): string {
  const statusText: Record<SolveResult['status'], string> = {
    solved: '已找到合法拼法',
    unsatisfiable: '无解（已完整穷尽搜索）',
    budget: '未确定（搜索预算耗尽，尚未穷尽）',
  };
  const lines = [
    `状态：${statusText[result.status]}`,
    `访问节点：${result.visitedNodes} / 预算 ${result.budget}`,
    `回溯数：${result.backtracks}`,
    `被排除候选：${result.rejectedCandidates}`,
    `解释事件：${result.explanation.length} 条${result.explanationTruncated ? '（已达展示上限并截断）' : ''}`,
  ];
  return lines.join('\n');
}

export function renderExplanation(events: ExplainEvent[], limit = 20): string {
  const shown = events.slice(0, limit);
  const lines = shown.map((ev) => {
    const [r, c] = ev.cell;
    const prefix = `深度${ev.depth} (${r},${c}) ${ev.kind}`;
    if (ev.kind === 'reject' && ev.reason) {
      const reason = ev.reason;
      if (reason.type === 'neighbor') {
        return `${prefix} 方块=${ev.tileId}：${reason.side}边颜色 "${reason.actual}" 与邻格 (${reason.neighbor[0]},${reason.neighbor[1]}) 需要的 "${reason.required}" 不一致`;
      }
      if (reason.type === 'border') {
        return `${prefix} 方块=${ev.tileId}：${reason.side}外边要求 "${reason.required}"，实际 "${reason.actual}"`;
      }
      if (reason.type === 'fixed') {
        return `${prefix}：固定编号 ${reason.fixedId} 在方块集合中不存在`;
      }
      return `${prefix}：该格没有任何可行候选`;
    }
    if (ev.kind === 'backtrack') {
      return `${prefix} 方块=${ev.tileId}：撤回`;
    }
    return `${prefix} 方块=${ev.tileId}`;
  });
  if (events.length > limit) {
    lines.push(`…… 其余 ${events.length - limit} 条事件未显示（可通过 explainLimit 调整）`);
  }
  return lines.join('\n');
}
