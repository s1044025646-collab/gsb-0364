import { LIMITS } from './limits';
import { invalid } from './errors';
import { Borders, BoardInput, FixedMap, Tile } from './types';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** 校验颜色：区分大小写的非空字符串，长度受限。 */
export function validateColor(value: unknown, field: string): string {
  if (!isNonEmptyString(value)) {
    throw invalid(`颜色 ${field} 必须是非空字符串`, { field });
  }
  if (value.length > LIMITS.MAX_COLOR_LEN) {
    throw invalid(`颜色 ${field} 长度 ${value.length} 超过上限 ${LIMITS.MAX_COLOR_LEN}`, {
      field,
      max: LIMITS.MAX_COLOR_LEN,
    });
  }
  return value;
}

/** 校验并规范化方块集合（保留原顺序，编号唯一）。 */
export function validateTiles(input: unknown, allowEmpty = false): Tile[] {
  if (!Array.isArray(input)) {
    throw invalid('tiles 必须是数组');
  }
  if (input.length === 0 && !allowEmpty) {
    throw invalid('方块集合不能为空（至少需要一种方块）');
  }
  if (input.length > LIMITS.MAX_TILES) {
    throw invalid(`方块数 ${input.length} 超过上限 ${LIMITS.MAX_TILES}`);
  }
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (raw === null || typeof raw !== 'object') {
      throw invalid(`第 ${i} 个方块不是对象`);
    }
    const t = raw as Record<string, unknown>;
    const id = t.id;
    if (!isNonEmptyString(id)) {
      throw invalid(`第 ${i} 个方块编号 id 必须是非空字符串`);
    }
    if (id.length > LIMITS.MAX_TILE_ID_LEN) {
      throw invalid(`方块编号 ${id} 长度超过上限 ${LIMITS.MAX_TILE_ID_LEN}`);
    }
    if (seen.has(id)) {
      throw invalid(`方块编号重复：${id}`);
    }
    seen.add(id);
    tiles.push({
      id,
      N: validateColor(t.N, `方块 ${id}.N`),
      E: validateColor(t.E, `方块 ${id}.E`),
      S: validateColor(t.S, `方块 ${id}.S`),
      W: validateColor(t.W, `方块 ${id}.W`),
    });
  }
  return tiles;
}

function isBorderArray(v: unknown): v is Array<string | null> {
  return Array.isArray(v) && v.every((x) => x === null || isNonEmptyString(x));
}

/**
 * 校验棋盘结构（尺寸、边界数组长度与颜色、固定格坐标与编号）。
 * 传入 tileIds 时同时校验固定编号存在性。
 */
export function validateBoard(body: unknown, tileIds?: ReadonlySet<string>): BoardInput {
  if (body === null || typeof body !== 'object') {
    throw invalid('board 必须是对象');
  }
  const b = body as Record<string, unknown>;
  const rowsRaw = b.rows;
  const colsRaw = b.cols;
  if (
    !Number.isInteger(rowsRaw) ||
    !Number.isInteger(colsRaw) ||
    (rowsRaw as number) <= 0 ||
    (colsRaw as number) <= 0
  ) {
    throw invalid('rows 与 cols 必须是正整数');
  }
  const rows = rowsRaw as number;
  const cols = colsRaw as number;
  if (rows > LIMITS.MAX_DIM || cols > LIMITS.MAX_DIM) {
    throw invalid(`网格每维不能超过 ${LIMITS.MAX_DIM}（收到 ${rows}x${cols}）`);
  }
  if (rows * cols > LIMITS.MAX_CELLS) {
    throw invalid(`网格总格子数 ${rows * cols} 超过上限 ${LIMITS.MAX_CELLS}`);
  }

  const bordersRaw = b.borders;
  let borders: Borders;
  if (bordersRaw === undefined || bordersRaw === null) {
    borders = {
      top: new Array(cols).fill(null),
      right: new Array(rows).fill(null),
      bottom: new Array(cols).fill(null),
      left: new Array(rows).fill(null),
    };
  } else {
    if (typeof bordersRaw !== 'object') {
      throw invalid('borders 必须是对象');
    }
    const br = bordersRaw as Record<string, unknown>;
    for (const key of ['top', 'right', 'bottom', 'left']) {
      if (!isBorderArray(br[key])) {
        throw invalid(`borders.${key} 必须是仅含字符串或 null 的数组`);
      }
    }
    borders = {
      top: (br.top as unknown[]).map((x) => (x === null ? null : (x as string))),
      right: (br.right as unknown[]).map((x) => (x === null ? null : (x as string))),
      bottom: (br.bottom as unknown[]).map((x) => (x === null ? null : (x as string))),
      left: (br.left as unknown[]).map((x) => (x === null ? null : (x as string))),
    };
    if (borders.top.length !== cols || borders.bottom.length !== cols) {
      throw invalid(`borders.top/bottom 长度必须等于 cols=${cols}`);
    }
    if (borders.left.length !== rows || borders.right.length !== rows) {
      throw invalid(`borders.left/right 长度必须等于 rows=${rows}`);
    }
    for (const color of [...borders.top, ...borders.right, ...borders.bottom, ...borders.left]) {
      if (color !== null) {
        validateColor(color, 'border');
      }
    }
  }

  const fixedRaw = b.fixed;
  const fixed: FixedMap = {};
  if (fixedRaw !== undefined && fixedRaw !== null) {
    if (typeof fixedRaw !== 'object' || Array.isArray(fixedRaw)) {
      throw invalid('fixed 必须是 "r,c" -> 方块编号 的对象');
    }
    const seenKeys = new Set<string>();
    for (const [key, value] of Object.entries(fixedRaw as Record<string, unknown>)) {
      const match = /^(\d+),(\d+)$/.exec(key);
      if (!match) {
        throw invalid(`fixed 键 "${key}" 格式应为 "r,c"，例如 "0,1"`);
      }
      const r = Number(match[1]);
      const c = Number(match[2]);
      if (r >= rows || c >= cols) {
        throw invalid(`fixed 格子 ${key} 越界（棋盘 ${rows}x${cols}）`);
      }
      if (!isNonEmptyString(value)) {
        throw invalid(`fixed[${key}] 必须是方块编号字符串`);
      }
      if (tileIds && !tileIds.has(value)) {
        throw invalid(`fixed[${key}] 引用了不存在的方块编号：${value}`);
      }
      if (seenKeys.has(key)) {
        throw invalid(`格子 ${key} 被重复固定`);
      }
      seenKeys.add(key);
      fixed[key] = value;
    }
  }

  return { rows, cols, borders, fixed };
}

export function validateBudget(v: unknown): number {
  if (v === undefined || v === null) {
    return LIMITS.DEFAULT_BUDGET;
  }
  if (!Number.isInteger(v) || (v as number) <= 0) {
    throw invalid('budget 必须是正整数');
  }
  const num = v as number;
  if (num > LIMITS.MAX_BUDGET) {
    throw invalid(`budget ${num} 超过上限 ${LIMITS.MAX_BUDGET}`);
  }
  return num;
}

export function validateExplainLimit(v: unknown): number {
  if (v === undefined || v === null) {
    return LIMITS.DEFAULT_EXPLAIN_LIMIT;
  }
  if (!Number.isInteger(v) || (v as number) < 0) {
    throw invalid('explainLimit 必须是非负整数');
  }
  const num = v as number;
  if (num > LIMITS.MAX_EXPLAIN_LIMIT) {
    throw invalid(`explainLimit ${num} 超过上限 ${LIMITS.MAX_EXPLAIN_LIMIT}`);
  }
  return num;
}
