import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { BoardInput, ExplainEvent, Tile } from './types';

export interface TileVersionRow {
  id: number;
  set_id: number;
  version: number;
  tiles_json: string;
  created_at: string;
}

export interface BoardRow {
  id: number;
  version_id: number;
  board_json: string;
  created_at: string;
}

export interface SearchRow {
  id: number;
  board_id: number;
  budget: number;
  explain_limit: number;
  status: 'solved' | 'unsatisfiable' | 'budget';
  solution_json: string | null;
  visited_nodes: number;
  backtracks: number;
  rejected_candidates: number;
  explanation_json: string;
  explanation_truncated: number;
  created_at: string;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tile_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tile_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_id INTEGER NOT NULL REFERENCES tile_sets(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        tiles_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(set_id, version)
      );
      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id INTEGER NOT NULL REFERENCES tile_versions(id) ON DELETE CASCADE,
        board_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        budget INTEGER NOT NULL,
        explain_limit INTEGER NOT NULL,
        status TEXT NOT NULL,
        solution_json TEXT,
        visited_nodes INTEGER NOT NULL,
        backtracks INTEGER NOT NULL,
        rejected_candidates INTEGER NOT NULL,
        explanation_json TEXT NOT NULL,
        explanation_truncated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  createTileSet(name: string, tiles: Tile[]): { setId: number; versionId: number; version: number } {
    const insSet = this.db.prepare('INSERT INTO tile_sets (name) VALUES (?)');
    const setInfo = insSet.run(name) as { lastInsertRowid: number | bigint };
    const setId = Number(setInfo.lastInsertRowid);
    const insV = this.db.prepare(
      'INSERT INTO tile_versions (set_id, version, tiles_json) VALUES (?, 1, ?)',
    );
    const vInfo = insV.run(setId, JSON.stringify(tiles));
    return { setId, versionId: Number(vInfo.lastInsertRowid), version: 1 };
  }

  addTileVersion(setId: number, tiles: Tile[]): { versionId: number; version: number } {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM tile_versions WHERE set_id = ?')
      .get(setId) as { v: number } | undefined;
    if (!row) {
      throw new Error('TILE_SET_NOT_FOUND');
    }
    const version = row.v + 1;
    const ins = this.db.prepare(
      'INSERT INTO tile_versions (set_id, version, tiles_json) VALUES (?, ?, ?)',
    );
    const info = ins.run(setId, version, JSON.stringify(tiles));
    return { versionId: Number(info.lastInsertRowid), version };
  }

  getTileSet(setId: number): { id: number; name: string } | null {
    return (
      (this.db.prepare('SELECT id, name FROM tile_sets WHERE id = ?').get(setId) as
        | { id: number; name: string }
        | undefined) ?? null
    );
  }

  listTileVersions(setId: number): TileVersionRow[] {
    return this.db
      .prepare('SELECT * FROM tile_versions WHERE set_id = ? ORDER BY version')
      .all(setId) as unknown as TileVersionRow[];
  }

  getVersion(versionId: number): TileVersionRow | null {
    return (
      (this.db.prepare('SELECT * FROM tile_versions WHERE id = ?').get(versionId) as
        | TileVersionRow
        | undefined) ?? null
    );
  }

  createBoard(versionId: number, board: BoardInput): number {
    const info = this.db
      .prepare('INSERT INTO boards (version_id, board_json) VALUES (?, ?)')
      .run(versionId, JSON.stringify(board));
    return Number(info.lastInsertRowid);
  }

  getBoard(boardId: number): BoardRow | null {
    return (
      (this.db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as BoardRow | undefined) ??
      null
    );
  }

  insertSearch(row: {
    board_id: number;
    budget: number;
    explain_limit: number;
    status: SearchRow['status'];
    solution: string[][] | null;
    visited_nodes: number;
    backtracks: number;
    rejected_candidates: number;
    explanation: ExplainEvent[];
    explanation_truncated: boolean;
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO searches
          (board_id, budget, explain_limit, status, solution_json, visited_nodes, backtracks,
           rejected_candidates, explanation_json, explanation_truncated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.board_id,
        row.budget,
        row.explain_limit,
        row.status,
        row.solution === null ? null : JSON.stringify(row.solution),
        row.visited_nodes,
        row.backtracks,
        row.rejected_candidates,
        JSON.stringify(row.explanation),
        row.explanation_truncated ? 1 : 0,
      );
    return Number(info.lastInsertRowid);
  }

  getSearch(searchId: number): SearchRow | null {
    return (
      (this.db.prepare('SELECT * FROM searches WHERE id = ?').get(searchId) as
        | SearchRow
        | undefined) ?? null
    );
  }

  listSearches(boardId: number): SearchRow[] {
    return this.db
      .prepare('SELECT * FROM searches WHERE board_id = ? ORDER BY id')
      .all(boardId) as unknown as SearchRow[];
  }

  listBoards(): BoardRow[] {
    return this.db.prepare('SELECT * FROM boards ORDER BY id').all() as unknown as BoardRow[];
  }
}

export function parseTiles(row: TileVersionRow): Tile[] {
  return JSON.parse(row.tiles_json) as Tile[];
}

export function parseBoard(row: BoardRow): BoardInput {
  return JSON.parse(row.board_json) as BoardInput;
}

export function parseSearch(row: SearchRow): {
  solution: string[][] | null;
  explanation: ExplainEvent[];
} {
  return {
    solution: row.solution_json === null ? null : (JSON.parse(row.solution_json) as string[][]),
    explanation: JSON.parse(row.explanation_json) as ExplainEvent[],
  };
}
