# Wang 色边方块拼接与无解原因核验后端

一个只做 **API + CLI** 的 Windows 本地后端：给定矩形网格和一批带四条边颜色的方块，
用自行实现的回溯搜索找出一个合法拼法，或在完整穷尽后判定无解；预算不足时如实报告“未确定”。

- 语言/运行时：TypeScript + Node.js（建议 Node ≥ 22.5，开发机为 Node v25）
- 存储：SQLite，使用 Node 内置 `node:sqlite`，**无需任何原生编译、Docker、WSL 或外部服务**
- 只依赖 `typescript` 与 `@types/node`（开发依赖），运行时零第三方包

## 方向与建模约定

- 方块：`{ id, N, E, S, W }`，`N=上、E=右、S=下、W=左`。
- 网格为 `rows × cols`，坐标 `(r,c)`，`r` 向下、`c` 向右增大。
- 相邻格接触边必须颜色相等：
  左格的 `E` = 右格的 `W`；上格的 `S` = 下格的 `N`（横向、竖向都检查）。
- 方块方向固定，**不允许旋转或翻面**；每种方块可**无限复用**。
- 颜色是**区分大小写**的非空字符串（`"Red"` 与 `"red"` 不同）。
- 方块编号 `id` 唯一；即使两种方块四边完全相同，也保留各自编号。
- 外边按位置给出颜色字符串，或用 `null` 明确表示**不约束**；未约束不等于某种真实颜色。
- 固定格用 `"r,c": 方块编号` 表示；其余格子由搜索器填充。

## 能力边界（明确不做）

- 不处理几何形状、多格骨牌、真实图片纹理、无限平面铺砌。
- 只求**一个**合法方案或判定无解，不枚举/统计所有方案。
- 不调用任何 SAT、约束求解或铺砖第三方库。

## 参数上限

| 项目 | 上限 |
| --- | --- |
| 每维行数 / 列数 | 8 |
| 网格总格子数 | 36 |
| 方块种类数 | 1000 |
| 颜色字符串长度 | 32 |
| 方块编号长度 | 64 |
| 单次搜索预算（访问节点数） | 10,000,000（默认 50,000） |
| 解释事件展示条数 | 2,000（默认 200） |

超限、错误固定编号、越界格子、重复固定、长度不匹配的边界数组都会以 `INVALID_PARAM` **预先拒绝**。

## 无解 vs 预算不足（关键区别）

- 搜索报告 `visitedNodes`（访问节点数）、`backtracks`（回溯数）、`rejectedCandidates`
  （被排除候选次数）和 `status`：
  - `solved`：找到合法拼法（结果还会经独立核验）。
  - `unsatisfiable`：**已完整穷尽**所有可能后确认无解，可安全宣称无解。
  - `budget`：访问节点达到预算、尚未穷尽，结果是**未确定**，不能解读为无解。
- 预算口径：每尝试放置一个候选方块记一次访问；达到预算立即停止。
- “展示条数上限”只截断解释事件的保存/展示，**不会**改变搜索预算或结论。
- 每个被排除候选都带冲突来源：邻格的哪条边、需要什么颜色/实际颜色，或哪条外边不符。

## 快速开始（Windows PowerShell）

```powershell
npm install        # 安装 typescript / @types/node
npm run build      # 编译到 dist/
npm test           # 编译并运行全部测试（node:test）
npm run demo       # 运行四个内置演示
npm start          # 启动 HTTP 服务（默认由系统选择空闲端口）
```

可选启动参数 / 环境变量：

```powershell
node dist/server.js --port 8080 --db ./data/wang.db
# 或
$env:PORT="8080"; $env:WANG_DB_PATH="./data/wang.db"; npm start
```

启动后会打印实际监听地址，例如 `http://127.0.0.1:54507`，先访问 `/health`。

## CLI

```powershell
node dist/cli.js demo [mono|checker|border-impossible|budget]
node dist/cli.js tiles-save <tiles.json> [名称]
node dist/cli.js board-create <versionId> <board.json>
node dist/cli.js conflicts <boardId>
node dist/cli.js solve <boardId> [--budget N] [--explain N]
node dist/cli.js search <searchId>
node dist/cli.js verify <boardId> <matrix.json>
node dist/cli.js export <searchId> [out.json]
```

`tiles.json` 示例：

```json
[
  { "id": "A", "N": "b", "E": "w", "S": "w", "W": "b" },
  { "id": "B", "N": "w", "E": "b", "S": "b", "W": "w" }
]
```

`board.json` 示例（边界可省略；省略视为四边全部 `null`）：

```json
{
  "rows": 2,
  "cols": 2,
  "borders": {
    "top": [null, null],
    "right": [null, null],
    "bottom": [null, null],
    "left": [null, null]
  },
  "fixed": { "0,0": "A" }
}
```

CLI 用**方块编号矩阵**展示方案，并用**边色诊断表**逐格列出四边颜色与该位置的外边约束
（`*` 表示该外边不约束）。`verify` 发现冲突时进程退出码为 `2`。

## HTTP API

所有请求/响应均为 JSON。参数错误返回 `400`，资源不存在返回 `404`，响应体形如
`{ "error": { "code": "...", "message": "...", "details": ... } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查与参数上限 |
| POST | `/tile-sets` | 保存方块集，返回 `setId/versionId/version` |
| POST | `/tile-sets/:setId/versions` | 修改方块 → 生成**新版本**（旧版本不可变） |
| GET | `/tile-sets/:setId/versions` | 列出某方块集的所有版本 |
| GET | `/versions/:versionId/tiles` | 查看某版本方块定义 |
| POST | `/boards` | 体 `{ versionId, board }` 建立棋盘 |
| GET | `/boards/:boardId` | 查看棋盘输入 |
| GET | `/boards/:boardId/conflicts` | 校验已固定格之间 / 与外边的局部冲突 |
| POST | `/boards/:boardId/solve` | 发起搜索，体 `{ budget?, explainLimit? }` |
| GET | `/searches/:searchId` | 查看历史搜索报告（重启后仍可查） |
| POST | `/boards/:boardId/verify` | 独立核验，体 `{ solution: [[id,...],...] }` |
| GET | `/searches/:searchId/export` | 导出方案 + 核验 + 统计的完整 JSON |

`solve` 响应要点：

```json
{
  "searchId": 1,
  "boardId": 1,
  "result": {
    "status": "solved",
    "solution": [["A", "B"], ["B", "A"]],
    "visitedNodes": 6,
    "backtracks": 0,
    "rejectedCandidates": 2,
    "explanation": [ "...有限深度的 place/reject/backtrack 事件..." ],
    "explanationTruncated": false,
    "budget": 50000
  },
  "verification": { "valid": true, "issues": [], "checkedEdges": 4, "checkedBorders": 0 }
}
```

用 curl 风格的 PowerShell 调用示例：

```powershell
Invoke-RestMethod -Method Post "$base/tile-sets" -ContentType 'application/json' `
  -Body '{"name":"demo","tiles":[{"id":"A","N":"b","E":"w","S":"w","W":"b"}]}'
```

## 独立核验（不信任搜索器）

`/verify` 与 CLI `verify` **完全独立**于搜索器：只检查

1. 每格编号是否存在、是否有缺格；
2. 固定格编号是否一致；
3. 全部相邻边（横向与竖向）颜色是否相等；
4. 所有被约束的外边颜色是否匹配（`null` 外边跳过）。

因此即使搜索器自报成功，篡改任意一格都会在 `issues` 中定位到具体格子、边、邻格、
期望颜色与实际颜色（测试中对篡改矩阵断言了 `edge-mismatch`）。

## 持久化与版本

SQLite 文件默认在项目内 `data/wang.db`（可用 `WANG_DB_PATH` 或 `--db` 改）。

- 方块集每次修改都新增一条**不可变版本**；棋盘创建时绑定具体 `versionId`。
- 旧棋盘/旧方案永远按旧版本方块解释，不会被新版本方块“套用”。
- 搜索结果（状态、方案、统计、解释事件、预算）全部落库；进程重启后仍可查询与导出完整明细。
- 不跨进程恢复递归栈：旧的未完成搜索保留原 `budget` 状态，再次 `solve` 生成**新的**报告记录。

## 错误码

| code | 含义 |
| --- | --- |
| `INVALID_PARAM` | 参数结构/上限/引用非法（400） |
| `NOT_FOUND` | 方块集/版本/棋盘/搜索不存在（404） |
| `INTERNAL` | 未预期的服务端异常（500） |

合法但拼不出的棋盘是**正常分析结果**（`unsatisfiable` / `budget`），不会用服务器异常代替。

## 测试覆盖

`npm test` 使用 `node:test`，覆盖：

- 一格、单行、单列、2×2 双色交替、相同四边不同编号；
- 固定格冲突、只在竖向发生的冲突、外边限制无解、无方块；
- 预算边界（极小预算返回 `budget` 而非无解）、确定性（同输入同首解）；
- 用**独立枚举所有带重复编号排列**的基准对小网格交叉核对成功/无解；
- 对成功方案逐边独立核验，并对故意篡改的一格断言定位到真实冲突；
- SQLite 版本不可变、重启后查询、新旧搜索报告互不覆盖；
- HTTP 全链路与 400/404 错误码。

## 已知限制与假设

- 搜索为直观回溯（行优先格序 + 方块集合顺序），未实现 MRV、弧相容等高级启发式；
  36 格、方块很多且强约束的难题可能需要调大 `budget`。
- 单进程、本地回环监听（`127.0.0.1`），未内置鉴权与多实例协调。
- `node:sqlite` 在当前 Node 版本会打印一条 ExperimentalWarning，不影响功能。
