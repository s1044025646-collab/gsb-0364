export interface Tile {
  id: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/** null 表示该位置外边不约束 */
export type Edge = string | null;

export interface Boundary {
  top: Edge[];    // 长度 = width，第 i 项对应 (0, i) 的上边
  right: Edge[];  // 长度 = height，第 i 项对应 (i, width-1) 的右边
  bottom: Edge[]; // 长度 = width，第 i 项对应 (height-1, i) 的下边
  left: Edge[];   // 长度 = height，第 i 项对应 (i, 0) 的左边
}

export interface FixedCell {
  row: number;
  col: number;
  tileId: string;
}

export interface BoardInput {
  tilesetId: string;
  tilesetVersion: number;
  width: number;
  height: number;
  boundary: Boundary;
  fixed: FixedCell[];
}

export type SearchStatus = "solved" | "unsat" | "unknown";

export interface TraceEntry {
  node: number;
  cell: [number, number];
  tileId: string;
  action: "reject" | "backtrack";
  reason: string;
}

export interface SearchReport {
  searchId: string;
  boardId: string;
  budget: number;
  status: SearchStatus;
  nodesVisited: number;
  backtracks: number;
  stopReason: string;
  solution: string[][] | null;
  trace: TraceEntry[];
  traceTruncated: boolean;
  createdAt: string;
}

export interface Violation {
  kind: "unknown_tile" | "fixed_mismatch" | "boundary_mismatch" | "neighbor_mismatch" | "grid_shape";
  detail: string;
  cell?: [number, number];
  otherCell?: [number, number];
  side?: "top" | "right" | "bottom" | "left";
  expected?: string | null;
  actual?: string | null;
}
