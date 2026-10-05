import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { BoardInput, SearchReport, Tile } from "./types.js";

export interface TilesetRow { id: string; version: number; tiles: Tile[]; createdAt: string; }
export interface BoardRow extends BoardInput { id: string; createdAt: string; }

export class Store {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tilesets (
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        tiles_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, version)
      );
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        tileset_id TEXT NOT NULL,
        tileset_version INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        boundary_json TEXT NOT NULL,
        fixed_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        budget INTEGER NOT NULL,
        status TEXT NOT NULL,
        nodes INTEGER NOT NULL,
        backtracks INTEGER NOT NULL,
        stop_reason TEXT NOT NULL,
        solution_json TEXT,
        trace_json TEXT NOT NULL,
        trace_truncated INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  createTileset(id: string, version: number, tiles: Tile[]): TilesetRow {
    const createdAt = new Date().toISOString();
    this.db.prepare("INSERT INTO tilesets (id, version, tiles_json, created_at) VALUES (?,?,?,?)")
      .run(id, version, JSON.stringify(tiles), createdAt);
    return { id, version, tiles, createdAt };
  }

  latestTilesetVersion(id: string): number | null {
    const row = this.db.prepare("SELECT MAX(version) AS v FROM tilesets WHERE id = ?").get(id) as { v: number | null };
    return row.v;
  }

  getTileset(id: string, version?: number): TilesetRow | null {
    const v = version ?? this.latestTilesetVersion(id);
    if (v === null) return null;
    const row = this.db.prepare("SELECT * FROM tilesets WHERE id = ? AND version = ?").get(id, v) as
      | { id: string; version: number; tiles_json: string; created_at: string }
      | undefined;
    if (!row) return null;
    return { id: row.id, version: row.version, tiles: JSON.parse(row.tiles_json), createdAt: row.created_at };
  }

  createBoard(board: BoardRow): void {
    this.db.prepare(
      "INSERT INTO boards (id, tileset_id, tileset_version, width, height, boundary_json, fixed_json, created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(board.id, board.tilesetId, board.tilesetVersion, board.width, board.height,
      JSON.stringify(board.boundary), JSON.stringify(board.fixed), board.createdAt);
  }

  getBoard(id: string): BoardRow | null {
    const row = this.db.prepare("SELECT * FROM boards WHERE id = ?").get(id) as
      | { id: string; tileset_id: string; tileset_version: number; width: number; height: number;
          boundary_json: string; fixed_json: string; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      tilesetId: row.tileset_id,
      tilesetVersion: row.tileset_version,
      width: row.width,
      height: row.height,
      boundary: JSON.parse(row.boundary_json),
      fixed: JSON.parse(row.fixed_json),
      createdAt: row.created_at,
    };
  }

  saveSearch(report: SearchReport): void {
    this.db.prepare(
      `INSERT INTO searches (id, board_id, budget, status, nodes, backtracks, stop_reason, solution_json, trace_json, trace_truncated, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(report.searchId, report.boardId, report.budget, report.status, report.nodesVisited, report.backtracks,
      report.stopReason, report.solution ? JSON.stringify(report.solution) : null,
      JSON.stringify(report.trace), report.traceTruncated ? 1 : 0, report.createdAt);
  }

  getSearch(id: string): SearchReport | null {
    const row = this.db.prepare("SELECT * FROM searches WHERE id = ?").get(id) as
      | { id: string; board_id: string; budget: number; status: string; nodes: number; backtracks: number;
          stop_reason: string; solution_json: string | null; trace_json: string; trace_truncated: number; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      searchId: row.id,
      boardId: row.board_id,
      budget: row.budget,
      status: row.status as SearchReport["status"],
      nodesVisited: row.nodes,
      backtracks: row.backtracks,
      stopReason: row.stop_reason,
      solution: row.solution_json ? JSON.parse(row.solution_json) : null,
      trace: JSON.parse(row.trace_json),
      traceTruncated: row.trace_truncated === 1,
      createdAt: row.created_at,
    };
  }

  listSearches(boardId: string): SearchReport[] {
    const rows = this.db.prepare("SELECT id FROM searches WHERE board_id = ? ORDER BY created_at").all(boardId) as { id: string }[];
    return rows.map((r) => this.getSearch(r.id)!);
  }
}
