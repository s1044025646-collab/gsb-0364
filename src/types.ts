/**
 * 核心领域类型。
 * 方向约定：N=上、E=右、S=下、W=左。
 * 网格按 rows x cols 存储，r 向下增大，c 向右增大。
 */

export type Side = 'N' | 'E' | 'S' | 'W';
export const SIDES: ReadonlyArray<Side> = ['N', 'E', 'S', 'W'];

/** 一个方块类型：唯一编号 + 四边颜色。方向固定，不可旋转/翻面。 */
export interface Tile {
  id: string;
  N: string;
  E: string;
  S: string;
  W: string;
}

/**
 * 网格外边约束，每个位置一个元素：
 *  - 字符串：要求该外边颜色等于该字符串
 *  - null：不约束（不能当成某种真实颜色）
 */
export interface Borders {
  /** 长度 cols，第 c 个约束第 0 行格子的上边 */
  top: Array<string | null>;
  /** 长度 rows，第 r 个约束最右列格子的右边 */
  right: Array<string | null>;
  /** 长度 cols，第 c 个约束最底行格子的下边 */
  bottom: Array<string | null>;
  /** 长度 rows，第 r 个约束最左列格子的左边 */
  left: Array<string | null>;
}

/** 预先固定：键为 "r,c"，值为方块编号 */
export type FixedMap = Record<string, string>;

export interface BoardInput {
  rows: number;
  cols: number;
  borders: Borders;
  fixed: FixedMap;
}

export type StopReason = 'solved' | 'unsatisfiable' | 'budget';

/** 候选被排除 / 放置 / 回溯时的解释事件 */
export interface ExplainEvent {
  depth: number;
  cell: [number, number];
  kind: 'place' | 'reject' | 'backtrack';
  tileId?: string;
  /** reject 时给出的冲突来源 */
  reason?:
    | { type: 'neighbor'; side: Side; neighbor: [number, number]; required: string; actual: string }
    | { type: 'border'; side: Side; required: string; actual: string }
    | { type: 'fixed'; fixedId: string }
    | { type: 'no-candidates' };
}

export interface SolveOptions {
  /** 访问节点预算（放置一个候选记一次访问） */
  budget: number;
  /** 解释事件保留条数上限，不影响搜索预算 */
  explainLimit: number;
}

export interface SolveResult {
  status: StopReason;
  /** 找到时的编号矩阵（rows x cols），否则为 null */
  solution: string[][] | null;
  visitedNodes: number;
  backtracks: number;
  /** 被排除候选次数（每个 reject 事件的去重前计数） */
  rejectedCandidates: number;
  explanation: ExplainEvent[];
  explanationTruncated: boolean;
  budget: number;
}

export interface VerificationIssue {
  cell: [number, number];
  kind:
    | 'unknown-tile'
    | 'fixed-mismatch'
    | 'missing-cell'
    | 'border-mismatch'
    | 'edge-mismatch';
  side?: Side;
  neighbor?: [number, number];
  expected?: string;
  actual?: string;
  message: string;
}

export interface VerificationReport {
  valid: boolean;
  issues: VerificationIssue[];
  checkedEdges: number;
  checkedBorders: number;
}
