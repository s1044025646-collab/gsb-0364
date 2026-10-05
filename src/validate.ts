import type { Boundary, FixedCell, Tile } from "./types.js";

export const LIMITS = {
  MAX_CELLS: 36,
  MAX_DIM: 8,
  MAX_TILES: 64,
  MAX_COLOR_LEN: 32,
  MAX_TILE_ID_LEN: 64,
  MAX_BUDGET: 1_000_000,
} as const;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function bad(code: string, msg: string): never {
  throw new ApiError(400, code, msg);
}

export function validateTiles(input: unknown): Tile[] {
  if (!Array.isArray(input)) bad("TILES_NOT_ARRAY", "tiles 必须是数组");
  if (input.length === 0) bad("TILES_EMPTY", "tiles 不能为空");
  if (input.length > LIMITS.MAX_TILES) bad("TOO_MANY_TILES", `方块数超过上限 ${LIMITS.MAX_TILES}`);
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) bad("TILE_NOT_OBJECT", "方块必须是对象");
    const t = raw as Record<string, unknown>;
    for (const key of ["id", "top", "right", "bottom", "left"]) {
      if (typeof t[key] !== "string") bad("TILE_FIELD_TYPE", `方块字段 ${key} 必须是字符串`);
    }
    const tile = t as unknown as Tile;
    if (tile.id.length === 0 || tile.id.length > LIMITS.MAX_TILE_ID_LEN)
      bad("TILE_ID_LENGTH", `方块编号长度须在 1..${LIMITS.MAX_TILE_ID_LEN}`);
    if (seen.has(tile.id)) bad("TILE_ID_DUP", `方块编号重复: ${tile.id}`);
    seen.add(tile.id);
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const c = tile[side];
      if (c.length === 0) bad("COLOR_EMPTY", `方块 ${tile.id} 的 ${side} 颜色不能为空`);
      if (c.length > LIMITS.MAX_COLOR_LEN) bad("COLOR_TOO_LONG", `颜色长度超过上限 ${LIMITS.MAX_COLOR_LEN}`);
    }
    tiles.push({ id: tile.id, top: tile.top, right: tile.right, bottom: tile.bottom, left: tile.left });
  }
  return tiles;
}

function validateEdgeArray(arr: unknown, len: number, name: string): (string | null)[] {
  if (!Array.isArray(arr)) bad("BOUNDARY_NOT_ARRAY", `边界 ${name} 必须是数组`);
  if (arr.length !== len) bad("BOUNDARY_LENGTH", `边界 ${name} 长度应为 ${len}，实际 ${arr.length}`);
  return arr.map((v, i) => {
    if (v === null) return null;
    if (typeof v !== "string" || v.length === 0) bad("BOUNDARY_VALUE", `边界 ${name}[${i}] 必须是非空字符串或 null`);
    if (v.length > LIMITS.MAX_COLOR_LEN) bad("COLOR_TOO_LONG", `边界颜色长度超过上限`);
    return v;
  });
}

export function validateBoardDims(width: unknown, height: unknown): { width: number; height: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height)) bad("DIM_NOT_INT", "width/height 必须是整数");
  const w = width as number, h = height as number;
  if (w < 1 || h < 1) bad("DIM_RANGE", "width/height 必须 >= 1");
  if (w > LIMITS.MAX_DIM || h > LIMITS.MAX_DIM) bad("DIM_TOO_LARGE", `每维不超过 ${LIMITS.MAX_DIM}`);
  if (w * h > LIMITS.MAX_CELLS) bad("TOO_MANY_CELLS", `总格数不超过 ${LIMITS.MAX_CELLS}`);
  return { width: w, height: h };
}

export function validateBoundary(input: unknown, width: number, height: number): Boundary {
  if (typeof input !== "object" || input === null) bad("BOUNDARY_NOT_OBJECT", "boundary 必须是对象");
  const b = input as Record<string, unknown>;
  return {
    top: validateEdgeArray(b.top, width, "top"),
    right: validateEdgeArray(b.right, height, "right"),
    bottom: validateEdgeArray(b.bottom, width, "bottom"),
    left: validateEdgeArray(b.left, height, "left"),
  };
}

export function unconstrainedBoundary(width: number, height: number): Boundary {
  return {
    top: Array(width).fill(null),
    right: Array(height).fill(null),
    bottom: Array(width).fill(null),
    left: Array(height).fill(null),
  };
}

export function validateFixed(input: unknown, width: number, height: number, tileIds: Set<string>): FixedCell[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) bad("FIXED_NOT_ARRAY", "fixed 必须是数组");
  const seen = new Set<string>();
  const out: FixedCell[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) bad("FIXED_NOT_OBJECT", "固定项必须是对象");
    const f = raw as Record<string, unknown>;
    if (!Number.isInteger(f.row) || !Number.isInteger(f.col)) bad("FIXED_COORD", "固定格 row/col 必须是整数");
    const row = f.row as number, col = f.col as number;
    if (row < 0 || row >= height || col < 0 || col >= width)
      bad("FIXED_OUT_OF_RANGE", `固定格 (${row},${col}) 越界`);
    const key = `${row},${col}`;
    if (seen.has(key)) bad("FIXED_DUP_CELL", `格子 (${row},${col}) 被重复固定`);
    seen.add(key);
    if (typeof f.tileId !== "string" || !tileIds.has(f.tileId))
      bad("FIXED_UNKNOWN_TILE", `固定格 (${row},${col}) 引用了不存在的方块编号: ${String(f.tileId)}`);
    out.push({ row, col, tileId: f.tileId });
  }
  return out;
}

export function validateBudget(input: unknown): number {
  if (input === undefined || input === null) return 100_000;
  if (!Number.isInteger(input) || (input as number) < 1) bad("BUDGET_INVALID", "maxNodes 必须是正整数");
  if ((input as number) > LIMITS.MAX_BUDGET) bad("BUDGET_TOO_LARGE", `maxNodes 不超过 ${LIMITS.MAX_BUDGET}`);
  return input as number;
}
