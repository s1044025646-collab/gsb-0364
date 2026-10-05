#!/usr/bin/env node
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { AppError } from './errors';
import { Store } from './store';
import { WangService } from './service';
import {
  validateBoard,
  validateBudget,
  validateExplainLimit,
  validateTiles,
} from './validation';
import { solve } from './solver';
import { verifySolution } from './verify';
import {
  renderEdgeTable,
  renderExplanation,
  renderIdMatrix,
  renderResultSummary,
  renderVerification,
} from './render';
import { allDemos, DEMOS } from './demo';
import { LIMITS } from './limits';

function defaultDb(): string {
  return process.env.WANG_DB_PATH
    ? resolve(process.env.WANG_DB_PATH)
    : resolve(process.cwd(), 'data', 'wang.db');
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function fail(err: unknown): never {
  if (err instanceof AppError) {
    process.stderr.write(`错误 [${err.code}]：${err.message}\n`);
  } else {
    process.stderr.write(`错误：${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exit(1);
}

function usage(): string {
  return [
    'Wang 方块拼接 CLI',
    '',
    '用法：',
    '  wang demo [名称]                 运行内置演示（mono|checker|border-impossible|budget，缺省全部）',
    '  wang tiles-save <tiles.json> [名称]   保存方块集，输出版本信息',
    '  wang board-create <versionId> <board.json>  建立棋盘',
    '  wang conflicts <boardId>         校验固定格/外边局部冲突',
    '  wang solve <boardId> [--budget N] [--explain N]  发起搜索并展示',
    '  wang search <searchId>           查看历史搜索报告（重启后可查）',
    '  wang verify <boardId> <matrix.json>  独立核验编号矩阵',
    '  wang export <searchId> [out.json]    导出完整结果 JSON',
    '',
    `限制：每维<=${LIMITS.MAX_DIM}，总格数<=${LIMITS.MAX_CELLS}，方块数<=${LIMITS.MAX_TILES}，颜色长度<=${LIMITS.MAX_COLOR_LEN}`,
    '环境变量 WANG_DB_PATH 可指定 SQLite 文件（默认 ./data/wang.db）',
  ].join('\n');
}

function printSolve(service: WangService, boardId: number, budget: number, explain: number): void {
  const resp = service.runSearch(boardId, budget, explain);
  const { board, versionId } = service.getBoard(boardId);
  const tiles = service.getTiles(versionId);
  process.stdout.write(`搜索记录 #${resp.searchId}\n`);
  process.stdout.write(renderResultSummary(resp.result) + '\n');
  if (resp.result.solution) {
    process.stdout.write('\n' + renderIdMatrix(resp.result.solution) + '\n');
    process.stdout.write('\n' + renderEdgeTable(tiles, board, resp.result.solution) + '\n');
  }
  if (resp.verification) {
    process.stdout.write('\n' + renderVerification(resp.verification) + '\n');
  }
  if (resp.result.explanation.length) {
    process.stdout.write('\n搜索解释（前 15 条）：\n' + renderExplanation(resp.result.explanation, 15) + '\n');
  }
}

function runDemo(name?: string): void {
  const cases = name ? [DEMOS[name]?.()] : allDemos();
  if (name && !DEMOS[name]) {
    throw new AppError('INVALID_PARAM', `未知演示：${name}`);
  }
  const casesList = cases.filter((c): c is NonNullable<typeof c> => Boolean(c));
  for (const demo of casesList) {
    process.stdout.write('\n========================================\n');
    process.stdout.write(`演示：${demo.name} — ${demo.description}\n`);
    process.stdout.write('----------------------------------------\n');
    const result = solve(demo.tiles, demo.board, {
      budget: demo.budget,
      explainLimit: 50,
    });
    process.stdout.write(renderResultSummary(result) + '\n');
    if (result.solution) {
      process.stdout.write('\n' + renderIdMatrix(result.solution) + '\n');
      process.stdout.write('\n' + renderEdgeTable(demo.tiles, demo.board, result.solution) + '\n');
      const report = verifySolution(demo.tiles, demo.board, result.solution);
      process.stdout.write('\n' + renderVerification(report) + '\n');
    }
    if (result.explanation.length) {
      process.stdout.write('\n搜索解释（前 10 条）：\n' + renderExplanation(result.explanation, 10) + '\n');
    }
  }
}

function main(argv: string[]): void {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(usage() + '\n');
    return;
  }

  if (command === 'demo') {
    runDemo(rest[0]);
    return;
  }

  // 以下命令需要持久化存储
  const store = new Store(defaultDb());
  const service = new WangService(store);
  try {
    switch (command) {
      case 'tiles-save': {
        const [path, name] = rest;
        if (!path) {
          throw new AppError('INVALID_PARAM', '缺少 tiles.json 路径');
        }
        const tiles = validateTiles(readJsonFile(path));
        const created = service.createTileSet(name ?? 'CLI 方块集', tiles);
        process.stdout.write(
          JSON.stringify({ ...created, tileCount: tiles.length }, null, 2) + '\n',
        );
        break;
      }
      case 'board-create': {
        const [versionIdRaw, path] = rest;
        const versionId = Number(versionIdRaw);
        if (!Number.isInteger(versionId) || !path) {
          throw new AppError('INVALID_PARAM', '用法：board-create <versionId> <board.json>');
        }
        const tiles = service.getTiles(versionId);
        const board = validateBoard(readJsonFile(path), new Set(tiles.map((t) => t.id)));
        const boardId = service.createBoard(versionId, board);
        process.stdout.write(JSON.stringify({ boardId, board }, null, 2) + '\n');
        break;
      }
      case 'conflicts': {
        const boardId = Number(rest[0]);
        if (!Number.isInteger(boardId)) {
          throw new AppError('INVALID_PARAM', '缺少 boardId');
        }
        process.stdout.write(JSON.stringify(service.checkConflicts(boardId), null, 2) + '\n');
        break;
      }
      case 'solve': {
        const boardId = Number(rest[0]);
        if (!Number.isInteger(boardId)) {
          throw new AppError('INVALID_PARAM', '缺少 boardId');
        }
        let budget: number = LIMITS.DEFAULT_BUDGET;
        let explain: number = LIMITS.DEFAULT_EXPLAIN_LIMIT;
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '--budget') {
            budget = validateBudget(Number(rest[++i]));
          } else if (rest[i] === '--explain') {
            explain = validateExplainLimit(Number(rest[++i]));
          }
        }
        printSolve(service, boardId, budget, explain);
        break;
      }
      case 'search': {
        const searchId = Number(rest[0]);
        if (!Number.isInteger(searchId)) {
          throw new AppError('INVALID_PARAM', '缺少 searchId');
        }
        const data = service.getSearch(searchId);
        const { board, versionId } = service.getBoard(data.boardId);
        const tiles = service.getTiles(versionId);
        process.stdout.write(renderResultSummary(data.result) + '\n');
        if (data.result.solution) {
          process.stdout.write('\n' + renderIdMatrix(data.result.solution) + '\n');
          process.stdout.write('\n' + renderEdgeTable(tiles, board, data.result.solution) + '\n');
        }
        if (data.verification) {
          process.stdout.write('\n' + renderVerification(data.verification) + '\n');
        }
        break;
      }
      case 'verify': {
        const [boardIdRaw, path] = rest;
        const boardId = Number(boardIdRaw);
        if (!Number.isInteger(boardId) || !path) {
          throw new AppError('INVALID_PARAM', '用法：verify <boardId> <matrix.json>');
        }
        const payload = readJsonFile(path);
        const matrix =
          typeof payload === 'object' && payload !== null && 'solution' in (payload as object)
            ? (payload as { solution: unknown }).solution
            : payload;
        const report = service.verify(boardId, matrix);
        process.stdout.write(renderVerification(report) + '\n');
        process.stdout.write('\n' + JSON.stringify(report, null, 2) + '\n');
        if (!report.valid) {
          process.exitCode = 2;
        }
        break;
      }
      case 'export': {
        const [searchIdRaw, outPath] = rest;
        const searchId = Number(searchIdRaw);
        if (!Number.isInteger(searchId)) {
          throw new AppError('INVALID_PARAM', '缺少 searchId');
        }
        const payload = service.exportResult(searchId);
        const text = JSON.stringify(payload, null, 2);
        if (outPath) {
          const { writeFileSync } = require('node:fs') as typeof import('node:fs');
          writeFileSync(resolve(outPath), text, 'utf-8');
          process.stdout.write(`已导出到 ${outPath}\n`);
        } else {
          process.stdout.write(text + '\n');
        }
        break;
      }
      default:
        process.stdout.write(usage() + '\n');
    }
  } finally {
    store.close();
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    fail(err);
  }
}

export { main };
