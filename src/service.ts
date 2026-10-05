import { notFound } from './errors';
import { solve } from './solver';
import {
  Store,
  parseBoard,
  parseSearch,
  parseTiles,
} from './store';
import { BoardInput, SolveResult, Tile, VerificationReport } from './types';
import { verifySolution } from './verify';

export interface SolveResponse {
  searchId: number;
  boardId: number;
  result: SolveResult;
  verification: VerificationReport | null;
}

export class WangService {
  constructor(readonly store: Store) {}

  createTileSet(name: string, tiles: Tile[]): { setId: number; versionId: number; version: number } {
    return this.store.createTileSet(name, tiles);
  }

  addTileVersion(setId: number, tiles: Tile[]): { versionId: number; version: number } {
    if (!this.store.getTileSet(setId)) {
      throw notFound(`方块集 ${setId} 不存在`);
    }
    return this.store.addTileVersion(setId, tiles);
  }

  listVersions(setId: number) {
    if (!this.store.getTileSet(setId)) {
      throw notFound(`方块集 ${setId} 不存在`);
    }
    return this.store.listTileVersions(setId).map((r) => ({
      versionId: r.id,
      version: r.version,
      tileCount: (JSON.parse(r.tiles_json) as Tile[]).length,
      createdAt: r.created_at,
    }));
  }

  getTiles(versionId: number): Tile[] {
    const row = this.store.getVersion(versionId);
    if (!row) {
      throw notFound(`方块版本 ${versionId} 不存在`);
    }
    return parseTiles(row);
  }

  createBoard(versionId: number, board: BoardInput): number {
    if (!this.store.getVersion(versionId)) {
      throw notFound(`方块版本 ${versionId} 不存在`);
    }
    return this.store.createBoard(versionId, board);
  }

  getBoard(boardId: number): { board: BoardInput; versionId: number } {
    const row = this.store.getBoard(boardId);
    if (!row) {
      throw notFound(`棋盘 ${boardId} 不存在`);
    }
    return { board: parseBoard(row), versionId: row.version_id };
  }

  /** 仅做局部/结构合法性检查（固定编号、越界等在 validation 已拦截，这里做组合预检）。 */
  checkConflicts(boardId: number): VerificationReport {
    const { board, versionId } = this.getBoard(boardId);
    const tiles = this.getTiles(versionId);
    // 以“固定格矩阵”作为部分方案做核验：未固定格留空，仅检验已固定格之间、与外边的关系。
    const partial: (string | null)[][] = Array.from({ length: board.rows }, () =>
      new Array<string | null>(board.cols).fill(null),
    );
    for (const [key, id] of Object.entries(board.fixed)) {
      const [r, c] = key.split(',').map(Number);
      partial[r][c] = id;
    }
    return verifySolution(tiles, board, partial);
  }

  runSearch(boardId: number, budget: number, explainLimit: number): SolveResponse {
    const { board, versionId } = this.getBoard(boardId);
    const tiles = this.getTiles(versionId);
    const result = solve(tiles, board, { budget, explainLimit });

    const searchId = this.store.insertSearch({
      board_id: boardId,
      budget,
      explain_limit: explainLimit,
      status: result.status,
      solution: result.solution,
      visited_nodes: result.visitedNodes,
      backtracks: result.backtracks,
      rejected_candidates: result.rejectedCandidates,
      explanation: result.explanation,
      explanation_truncated: result.explanationTruncated,
    });

    let verification: VerificationReport | null = null;
    if (result.status === 'solved' && result.solution) {
      // 成功方案必须再独立核验，绝不以搜索器标志为准。
      verification = verifySolution(tiles, board, result.solution);
    }

    return { searchId, boardId, result, verification };
  }

  getSearch(searchId: number): {
    result: SolveResult;
    boardId: number;
    verification: VerificationReport | null;
  } {
    const row = this.store.getSearch(searchId);
    if (!row) {
      throw notFound(`搜索记录 ${searchId} 不存在`);
    }
    const parsed = parseSearch(row);
    const { board, versionId } = this.getBoard(row.board_id);
    const tiles = this.getTiles(versionId);
    const result: SolveResult = {
      status: row.status as SolveResult['status'],
      solution: parsed.solution,
      visitedNodes: row.visited_nodes,
      backtracks: row.backtracks,
      rejectedCandidates: row.rejected_candidates,
      explanation: parsed.explanation,
      explanationTruncated: row.explanation_truncated === 1,
      budget: row.budget,
    };
    const verification =
      result.status === 'solved' && result.solution
        ? verifySolution(tiles, board, result.solution)
        : null;
    return { result, boardId: row.board_id, verification };
  }

  verify(boardId: number, matrix: unknown): VerificationReport {
    const { board, versionId } = this.getBoard(boardId);
    const tiles = this.getTiles(versionId);
    return verifySolution(tiles, board, matrix);
  }

  exportResult(searchId: number) {
    const row = this.store.getSearch(searchId);
    if (!row) {
      throw notFound(`搜索记录 ${searchId} 不存在`);
    }
    const parsed = parseSearch(row);
    const { board, versionId } = this.getBoard(row.board_id);
    const tiles = this.getTiles(versionId);
    const verification =
      row.status === 'solved' && parsed.solution
        ? verifySolution(tiles, board, parsed.solution)
        : null;
    return {
      searchId,
      boardId: row.board_id,
      versionId,
      budget: row.budget,
      explainLimit: row.explain_limit,
      status: row.status,
      solution: parsed.solution,
      verification,
      stats: {
        visitedNodes: row.visited_nodes,
        backtracks: row.backtracks,
        rejectedCandidates: row.rejected_candidates,
      },
      board,
    };
  }
}
