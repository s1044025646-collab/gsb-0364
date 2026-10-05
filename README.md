# Wang 色边方块拼接后端

Windows 本地可运行的 Wang 方块（Wang tiles）有限网格拼接与无解原因核验服务。
仅提供 HTTP API 与 CLI，无前端。技术栈：TypeScript + Node.js（>= 22，推荐 25）+ SQLite（Node 内置 `node:sqlite`，零原生依赖、零外部服务）。

## 问题定义

- 每种方块有唯一编号与上、右、下、左四条边的颜色（区分大小写的非空字符串）。
- 给定矩形网格，每格放一块；上下左右相邻格子的接触边颜色必须相等。
- 方块类型可**无限复用**；方向**固定**，不允许旋转或翻面。
- 网格外边可逐位置指定颜色，或用 `null` 明确表示不约束（未指定**不是**一种颜色）。
- 可预先固定少量格子的方块编号；即使两种方块四边相同，也各自保留编号，按编号字典序稳定选择。

## 方向与坐标约定

- 坐标 `(row, col)` 从 0 开始，`row` 向下增长，`col` 向右增长。
- 边界数组：`top`/`bottom` 长度为 `width`，`left`/`right` 长度为 `height`。
- 方块四边字段 `top/right/bottom/left` 即放置后的实际朝向，不做任何旋转。

## 限制

| 项 | 上限 |
| --- | --- |
| 总格数 | 36 |
| 每维 | 8 |
| 方块种数 | 64 |
| 颜色长度 | 32 字符 |
| 搜索预算 maxNodes | 1,000,000（默认 100,000） |

## 搜索语义

- 自行实现的确定性回溯搜索（不调用任何 SAT/约束/铺砖库）：行优先逐格放置，候选按编号字典序，固定格优先。
- 只找**一个**合法拼法或确定无解，不统计全部方案；相同输入必返回相同首个方案。
- 每个被排除的候选都记录冲突的邻格或外边条件；解释（trace）展示上限 200 条，**不影响**搜索预算。
- 停止原因三种：
  - `solved`：找到合法拼法；
  - `unsat`：搜索空间**完整穷尽**，确认无解；
  - `unknown`：预算耗尽，结果**未确定**（预算不足 ≠ 无解）。
- 报告记录访问节点数、回溯次数与停止原因，持久化到 SQLite，重启后仍可查询。

## 独立核验

`verify` 不依赖搜索器的成功标志，只依据棋盘输入与方块定义逐格检查：编号是否存在、固定格是否一致、外边是否满足、全部水平与竖直邻边是否相等。故意篡改方案中的任一格，会定位到具体的冲突格与边。

## 版本与持久化

- 方块集不可变；`POST /tilesets/:id/versions` 基于既有方块集创建 `version+1` 的新版本。
- 棋盘与搜索结果都绑定具体的 `(tilesetId, version)`，旧方案不会被新方块定义"解释"。
- 数据保存在项目内 `data/wang.db`（可用环境变量 `WANG_DB` 覆盖）。
- 不跨进程恢复递归栈：未完成的旧搜索保留原停止状态，再次运行生成新报告。

## 命令

```powershell
npm install        # 仅安装 typescript 与 @types/node（开发依赖）
npm run build      # 编译到 dist/
npm test           # 构建并运行全部测试
npm start          # 启动 API（默认端口 0 = 自动选择空闲端口；--port 或 PORT 可指定）
npm run demo       # 运行四个演示场景
npm run cli -- ... # 运行 CLI
```

## HTTP API

统一错误格式：`{ "error": { "code": "...", "message": "..." } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/tilesets` | 保存方块集（版本 1），body `{tiles:[{id,top,right,bottom,left}]}` |
| POST | `/tilesets/:id/versions` | 基于既有方块集创建新版本 |
| GET | `/tilesets/:id` | 查看最新版本方块集 |
| POST | `/boards` | 建立棋盘：`{tilesetId, tilesetVersion?, width, height, boundary?, fixed?}` |
| GET | `/boards/:id` | 查看棋盘 |
| POST | `/boards/:id/check-fixed` | 校验固定格之间的局部冲突 |
| POST | `/boards/:id/search` | 发起搜索，body `{maxNodes?}` |
| GET | `/boards/:id/searches` | 列出该棋盘全部搜索报告 |
| GET | `/searches/:id` | 查看搜索报告与方案 |
| GET | `/searches/:id/export` | 导出完整结果（含独立核验明细） |
| POST | `/boards/:id/verify` | 独立核验候选编号矩阵，body `{grid:[[...]]}` |

主要错误码：`TILES_EMPTY`、`TILE_ID_DUP`、`COLOR_EMPTY`、`DIM_TOO_LARGE`、`TOO_MANY_CELLS`、`BOUNDARY_LENGTH`、`FIXED_OUT_OF_RANGE`、`FIXED_DUP_CELL`、`FIXED_UNKNOWN_TILE`、`BUDGET_INVALID`、`TILESET_NOT_FOUND`、`BOARD_NOT_FOUND`、`SEARCH_NOT_FOUND`、`BAD_JSON`。

## CLI

```powershell
node dist/src/cli.js add-tiles '{"tiles":[{"id":"A","top":"x","right":"x","bottom":"x","left":"x"}]}'
node dist/src/cli.js new-board '{"tilesetId":"<id>","width":2,"height":2}'
node dist/src/cli.js search <boardId> 1000     # 展示编号矩阵 + 边色诊断表
node dist/src/cli.js show <searchId>
node dist/src/cli.js verify <boardId> '[["A","A"],["A","A"]]'
node dist/src/cli.js check-fixed <boardId>
node dist/src/cli.js export <searchId>
node dist/src/cli.js new-version <tilesetId> '{"tiles":[...]}'
```

JSON 参数也可用 `@文件路径` 从文件读取。`search`/`show` 会打印方块编号矩阵与逐邻边一致性诊断表。

## 演示场景（`npm run demo`）

1. 单色方块无限复用拼满 3x3；
2. 双色必须交替的 4x4 拼接；
3. 外边限制导致无解（附冲突解释）；
4. 很小预算下返回"未确定"。

## 测试覆盖

一格棋盘、单行/单列、相同四边不同编号的稳定排序、固定格冲突、只在竖向发生的冲突、空方块集、预算边界（耗尽为 unknown、恰好够用为 solved）、输入校验错误、小网格暴力枚举基准对照、篡改一格后的冲突定位、HTTP 端到端、固定格局部校验、版本不可变与持久化查询。

## 已知限制

- 仅回溯 + 局部候选过滤，未实现弧一致性等高级传播；大网格复杂实例可能耗尽预算返回 `unknown`。
- `node:sqlite` 在 Node 25 仍标记为实验特性（启动时会有警告），功能稳定可用。
- 搜索解释展示上限 200 条（可在 `src/solver.ts` 的 `TRACE_LIMIT` 调整），截断不影响搜索本身。
