import { randomUUID } from "node:crypto";
import { Store, type BoardRow } from "./store.js";
import { solve } from "./solver.js";
import { verifyCandidate } from "./verify.js";
import { ApiError, validateBoardDims, validateBoundary, validateBudget, validateFixed, validateTiles, unconstrainedBoundary } from "./validate.js";
import type { BoardInput, SearchReport, Tile, Violation } from "./types.js";

export class WangService {
  store: Store;
  constructor(store: Store) {
    this.store = store;
  }

  createTileset(input: unknown, baseId?: string) {
    const body = (input ?? {}) as Record<string, unknown>;
    const tiles = validateTiles(body.tiles);
    let id: string;
    let version: number;
    if (baseId !== undefined) {
      const latest = this.store.latestTilesetVersion(baseId);
      if (latest === null) throw new ApiError(404, "TILESET_NOT_FOUND", `方块集不存在: ${baseId}`);
      id = baseId;
      version = latest + 1;
    } else {
      id = randomUUID();
      version = 1;
    }
    return this.store.createTileset(id, version, tiles);
  }

  getTileset(id: string, version?: number) {
    const ts = this.store.getTileset(id, version);
    if (!ts) throw new ApiError(404, "TILESET_NOT_FOUND", `方块集不存在: ${id}`);
    return ts;
  }

  createBoard(input: unknown): BoardRow {
    const body = (input ?? {}) as Record<string, unknown>;
    if (typeof body.tilesetId !== "string") throw new ApiError(400, "TILESET_ID_REQUIRED", "需要 tilesetId");
    const version = body.tilesetVersion === undefined ? undefined : Number(body.tilesetVersion);
    const ts = this.getTileset(body.tilesetId, version);
    const { width, height } = validateBoardDims(body.width, body.height);
    const boundary = body.boundary === undefined
      ? unconstrainedBoundary(width, height)
      : validateBoundary(body.boundary, width, height);
    const tileIds = new Set(ts.tiles.map((t) => t.id));
    const fixed = validateFixed(body.fixed, width, height, tileIds);
    const board: BoardRow = {
      id: randomUUID(),
      tilesetId: ts.id,
      tilesetVersion: ts.version,
      width,
      height,
      boundary,
      fixed,
      createdAt: new Date().toISOString(),
    };
    this.store.createBoard(board);
    return board;
  }

  getBoard(id: string): BoardRow {
    const board = this.store.getBoard(id);
    if (!board) throw new ApiError(404, "BOARD_NOT_FOUND", `棋盘不存在: ${id}`);
    return board;
  }

  private boardInput(board: BoardRow): BoardInput {
    return {
      tilesetId: board.tilesetId,
      tilesetVersion: board.tilesetVersion,
      width: board.width,
      height: board.height,
      boundary: board.boundary,
      fixed: board.fixed,
    };
  }

  private boardTiles(board: BoardRow): Tile[] {
    return this.getTileset(board.tilesetId, board.tilesetVersion).tiles;
  }

  /** 仅检查固定格之间的局部冲突（邻边与边界），不运行搜索 */
  checkFixed(boardId: string): Violation[] {
    const board = this.getBoard(boardId);
    const tiles = this.boardTiles(board);
    const grid: (string | null)[][] = Array.from({ length: board.height }, () => Array(board.width).fill(null));
    for (const f of board.fixed) grid[f.row][f.col] = f.tileId;
    const partial = grid.map((row) => row.map((id) => id ?? "__empty__"));
    const violations = verifyCandidate(this.boardInput(board), tiles, partial)
      .filter((v) => v.kind !== "unknown_tile");
    return violations;
  }

  runSearch(boardId: string, maxNodesInput: unknown): SearchReport {
    const board = this.getBoard(boardId);
    const budget = validateBudget(maxNodesInput);
    const tiles = this.boardTiles(board);
    const result = solve(this.boardInput(board), tiles, budget);
    const report: SearchReport = {
      searchId: randomUUID(),
      boardId,
      budget,
      status: result.status,
      nodesVisited: result.nodesVisited,
      backtracks: result.backtracks,
      stopReason: result.stopReason,
      solution: result.solution,
      trace: result.trace,
      traceTruncated: result.traceTruncated,
      createdAt: new Date().toISOString(),
    };
    this.store.saveSearch(report);
    return report;
  }

  getSearch(id: string): SearchReport {
    const report = this.store.getSearch(id);
    if (!report) throw new ApiError(404, "SEARCH_NOT_FOUND", `搜索记录不存在: ${id}`);
    return report;
  }

  /** 独立核验候选方案；grid 为编号矩阵 */
  verify(boardId: string, grid: unknown): { ok: boolean; violations: Violation[] } {
    const board = this.getBoard(boardId);
    const tiles = this.boardTiles(board);
    const violations = verifyCandidate(this.boardInput(board), tiles, grid);
    return { ok: violations.length === 0, violations };
  }

  exportSearch(searchId: string) {
    const report = this.getSearch(searchId);
    const board = this.getBoard(report.boardId);
    const tiles = this.boardTiles(board);
    const verification = report.solution
      ? { ok: true, violations: verifyCandidate(this.boardInput(board), tiles, report.solution) }
      : null;
    return {
      exportedAt: new Date().toISOString(),
      tileset: { id: board.tilesetId, version: board.tilesetVersion, tiles },
      board,
      search: report,
      solutionVerification: verification,
    };
  }
}
