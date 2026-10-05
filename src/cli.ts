import { readFileSync } from "node:fs";
import { Store } from "./store.js";
import { WangService } from "./service.js";
import { defaultDbPath } from "./api.js";
import type { BoardRow } from "./store.js";
import type { Tile } from "./types.js";

const service = new WangService(new Store(defaultDbPath()));

function readJson(arg: string): unknown {
  if (arg.startsWith("@")) return JSON.parse(readFileSync(arg.slice(1), "utf8"));
  return JSON.parse(arg);
}

function printSolutionMatrix(solution: string[][]): void {
  console.log("方案（方块编号矩阵）:");
  const w = Math.max(...solution.flat().map((s) => s.length));
  for (const row of solution) console.log("  " + row.map((id) => id.padStart(w)).join(" "));
}

function printEdgeDiagnostics(board: BoardRow, tiles: Tile[], solution: string[][]): void {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  console.log("边色诊断表（每格: 编号[上 右 下 左]）:");
  for (let r = 0; r < board.height; r++) {
    const parts: string[] = [];
    for (let c = 0; c < board.width; c++) {
      const t = byId.get(solution[r][c])!;
      parts.push(`${t.id}[${t.top},${t.right},${t.bottom},${t.left}]`);
    }
    console.log("  " + parts.join("  "));
  }
  console.log("邻边一致性:");
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) {
      const t = byId.get(solution[r][c])!;
      if (c + 1 < board.width) {
        const rt = byId.get(solution[r][c + 1])!;
        console.log(`  (${r},${c}).右=${t.right} ${t.right === rt.left ? "==" : "!="} (${r},${c + 1}).左=${rt.left}`);
      }
      if (r + 1 < board.height) {
        const dn = byId.get(solution[r + 1][c])!;
        console.log(`  (${r},${c}).下=${t.bottom} ${t.bottom === dn.top ? "==" : "!="} (${r + 1},${c}).上=${dn.top}`);
      }
    }
  }
}

function showSearch(searchId: string): void {
  const report = service.getSearch(searchId);
  console.log(`搜索 ${report.searchId}`);
  console.log(`  状态: ${report.status}  节点: ${report.nodesVisited}  回溯: ${report.backtracks}`);
  console.log(`  停止原因: ${report.stopReason}`);
  if (report.traceTruncated) console.log("  (解释条数已达展示上限，仅保留前 200 条；不影响搜索预算)");
  if (report.solution) {
    const board = service.getBoard(report.boardId);
    const tiles = service.getTileset(board.tilesetId, board.tilesetVersion).tiles;
    printSolutionMatrix(report.solution);
    printEdgeDiagnostics(board, tiles, report.solution);
  }
}

const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case "add-tiles": {
      const ts = service.createTileset(readJson(args[0]));
      console.log(JSON.stringify({ tilesetId: ts.id, version: ts.version }, null, 2));
      break;
    }
    case "new-version": {
      const ts = service.createTileset(readJson(args[1]), args[0]);
      console.log(JSON.stringify({ tilesetId: ts.id, version: ts.version }, null, 2));
      break;
    }
    case "new-board": {
      const b = service.createBoard(readJson(args[0]));
      console.log(JSON.stringify({ boardId: b.id }, null, 2));
      break;
    }
    case "check-fixed": {
      console.log(JSON.stringify({ violations: service.checkFixed(args[0]) }, null, 2));
      break;
    }
    case "search": {
      const report = service.runSearch(args[0], args[1] === undefined ? undefined : Number(args[1]));
      console.log(`搜索完成: ${report.status} (${report.stopReason})`);
      console.log(`searchId: ${report.searchId}`);
      showSearch(report.searchId);
      break;
    }
    case "show":
      showSearch(args[0]);
      break;
    case "verify": {
      const result = service.verify(args[0], readJson(args[1]));
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "export": {
      console.log(JSON.stringify(service.exportSearch(args[0]), null, 2));
      break;
    }
    default:
      console.log(`用法: node src/cli.ts <命令>
  add-tiles '<json|@file>'            保存方块集（版本 1）
  new-version <tilesetId> '<json>'    基于既有方块集创建新版本
  new-board '<json|@file>'            建立棋盘（含边界与固定格）
  check-fixed <boardId>               校验固定格局部冲突
  search <boardId> [maxNodes]         发起搜索并展示方案
  show <searchId>                     查看方案与边色诊断表
  verify <boardId> '<grid|@file>'     独立核验候选编号矩阵
  export <searchId>                   导出搜索完整结果 JSON`);
  }
} catch (err) {
  const e = err as { code?: string; message?: string };
  console.error(`错误 [${e.code ?? "INTERNAL"}]: ${e.message ?? String(err)}`);
  process.exitCode = 1;
}
