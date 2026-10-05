import { BoardInput, Tile } from '../types';
import { verifySolution } from '../verify';

/**
 * 独立基准：枚举“所有带重复的编号排列”（base = 方块数），
 * 仅用于小网格（<=4 格，方块数<=2），与回溯器结果交叉核对。
 * 固定格通过在枚举序列上再做核验来强制（verify 会报告 fixed-mismatch）。
 */
export function bruteForceSolvable(tiles: Tile[], board: BoardInput): boolean {
  const total = board.rows * board.cols;
  const base = tiles.length;
  if (base === 0) {
    return Object.keys(board.fixed).length === 0 ? false : false;
  }
  const count = Math.pow(base, total);
  for (let n = 0; n < count; n++) {
    const matrix: string[][] = [];
    let value = n;
    for (let r = 0; r < board.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < board.cols; c++) {
        row.push(tiles[value % base].id);
        value = Math.floor(value / base);
      }
      matrix.push(row);
    }
    const report = verifySolution(tiles, board, matrix);
    if (report.valid) {
      return true;
    }
  }
  return false;
}

/** 简单确定性伪随机，用于生成测试棋盘。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
