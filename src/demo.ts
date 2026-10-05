import { BoardInput, Tile } from './types';

export interface DemoCase {
  name: string;
  description: string;
  tiles: Tile[];
  board: BoardInput;
  budget: number;
}

function freeBorders(rows: number, cols: number): BoardInput['borders'] {
  return {
    top: new Array(cols).fill(null),
    right: new Array(rows).fill(null),
    bottom: new Array(cols).fill(null),
    left: new Array(rows).fill(null),
  };
}

/** 演示 1：单色方块可重复拼满任意网格。 */
function monoCase(): DemoCase {
  return {
    name: 'mono',
    description: '单色方块可重复拼满 3x3 网格',
    tiles: [{ id: 'M', N: 'r', E: 'r', S: 'r', W: 'r' }],
    board: { rows: 3, cols: 3, borders: freeBorders(3, 3), fixed: {} },
    budget: 5000,
  };
}

/** 演示 2：双色必须交替（棋盘格），可行。 */
function checkerCase(): DemoCase {
  return {
    name: 'checker',
    description: '双色 2x2 必须交替拼接（角块 + 边块组合，可行）',
    tiles: [
      { id: 'A', N: 'b', E: 'w', S: 'w', W: 'b' },
      { id: 'B', N: 'w', E: 'b', S: 'b', W: 'w' },
    ],
    board: { rows: 2, cols: 2, borders: freeBorders(2, 2), fixed: { '0,0': 'A' } },
    budget: 5000,
  };
}

/** 演示 3：外边限制导致无解（1x1，方块没有任何一边同时为 b/w 组合）。 */
function borderImpossibleCase(): DemoCase {
  return {
    name: 'border-impossible',
    description: '1x1 外边四边分别要求 b/b/b/w，没有方块满足，无解',
    tiles: [{ id: 'X', N: 'b', E: 'b', S: 'b', W: 'b' }],
    board: {
      rows: 1,
      cols: 1,
      borders: { top: ['b'], right: ['b'], bottom: ['b'], left: ['w'] },
      fixed: {},
    },
    budget: 5000,
  };
}

/** 演示 4：预算极小，尚未确定。用一个需要多次回溯的 2x2 棋盘。 */
function budgetCase(): DemoCase {
  return {
    name: 'budget',
    description: '2x2 固定格使首路走不通，预算仅 2，搜索未确定',
    tiles: [
      { id: 'A', N: 'b', E: 'w', S: 'w', W: 'b' },
      { id: 'B', N: 'w', E: 'b', S: 'b', W: 'w' },
    ],
    board: { rows: 2, cols: 2, borders: freeBorders(2, 2), fixed: { '0,0': 'A' } },
    budget: 2,
  };
}

export const DEMOS: Record<string, () => DemoCase> = {
  mono: monoCase,
  checker: checkerCase,
  'border-impossible': borderImpossibleCase,
  budget: budgetCase,
};

export function allDemos(): DemoCase[] {
  return Object.values(DEMOS).map((fn) => fn());
}
