/**
 * 全局参数上限与边界常量。
 * 所有上限均为硬性校验，越界直接以参数错误拒绝。
 */
export const LIMITS = {
  /** 网格每维（行数 / 列数）上限 */
  MAX_DIM: 8,
  /** 网格总格子数上限（8x8 之外再保险一次） */
  MAX_CELLS: 36,
  /** 单个方块集合允许的方块种类数上限 */
  MAX_TILES: 1000,
  /** 单个颜色字符串长度上限（区分大小写，非空） */
  MAX_COLOR_LEN: 32,
  /** 方块编号字符串长度上限 */
  MAX_TILE_ID_LEN: 64,
  /** 单次搜索访问节点数预算上限 */
  MAX_BUDGET: 10_000_000,
  /** 默认搜索访问节点数预算 */
  DEFAULT_BUDGET: 50_000,
  /** 默认保留的解释事件条数（不影响搜索预算） */
  DEFAULT_EXPLAIN_LIMIT: 200,
  /** 解释事件条数上限 */
  MAX_EXPLAIN_LIMIT: 2000,
} as const;
