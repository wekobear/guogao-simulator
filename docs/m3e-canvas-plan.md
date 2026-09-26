# 过稿模拟器 × M3E Canvas × 多 CLI 协作整合方案

> 2026-09-26 定稿。本文件同时是 codex / agy 协作任务的共享规格：下发给 CLI 的任务提示词一律指向本文件路径，不复述内容。

## 0. 结论

- **工具选型**：[lnkiai/m3e-canvas](https://github.com/lnkiai/m3e-canvas)（MIT，⭐8.2k，活跃维护，Next.js 16 + React 19，纯前端 localStorage）作为游戏内「画原型」环节的工具。与本项目「无后端、无登录、无模型密钥」的约束完全同频。
- **玩法嵌入**：原型流程嵌进 PREPARE 阶段第一轮——玩家在画布上画「石影 X1 上新落地页」原型，规则引擎以纯函数分析设计结构，换算初始指标；老板退回意见与结构化发现联动（仍是脚本规则，AI 不决定评分）。
- **开发方式**：ZCode 编排 + `codex exec`（实现型任务）+ `agy -p`（结构化输出/文案/互审），git worktree 三条工作流并行，现有测试套件做合并门禁。

## 1. 选型依据

| 项 | 结论 |
|---|---|
| 许可证 | MIT，可 fork、可改、可随游戏分发，保留版权声明即可 |
| 技术栈 | Next.js 16 + React 19 + TS，无后端（localStorage） |
| 活跃度 | 2026-09-24 仍有 push；有桌面版/Pro 版等多个社区衍生 |

对游戏有用的能力清单：

- 拖拽 M3 Expressive 部件（按钮、卡片、应用栏、FAB、导航栏等 30+ 种）
- 手机屏（412×892）与桌面屏（1280×800）双尺寸 → 桌面屏正好画 DTC 独立站落地页
- 页面间点击/滑动导航连线，预览可真实点按走流程
- 主题面板：一个 seed color 生成完整 M3 配色 → 用于「石影品牌色一致性」判定
- 导出中文自然语言 prompt（整份设计 → 结构化简报）→ 游戏内呈现为《交给开发的需求文档》
- 分享链接（URL 序列化整个设计，beta）→ 游戏读取设计数据现成通道
- 单屏 PNG 导出 → 评审页「稿件卡」图片
- 手机端自带单屏简化编辑器（按钮式、底部弹层编辑）→ 契合游戏竖屏优先

风险与对策见 §6。

## 2. 游戏设计：原型流程怎么变成玩法

### 2.1 嵌入位置

现有 Phase 流 `PREPARE → REVIEW → RESPOND → EVENT → BONUS → PARTY → ENDING`。在 PREPARE 第一轮新增「SKETCH 画原型」子环节：

1. 工作台（WorkspaceView）先出现画布面板：旁边是需求卡（`config.brief.requirementLines`），画布预置一个 1280×800 桌面屏 + 石影品牌 seed color 起手。
2. 玩家拼界面、连导航、写部件备注，点「提交评审」。
3. 引擎读取设计数据 → 生成初始指标 → 走既有 REVIEW 流程（评审快照、三次提交上限等逻辑全部不动）。

### 2.2 计分映射（纯函数）

新模块 `src/game/prototype.ts`：

```
analyzePrototype(design) → {
  completeness,   // 屏数、部件覆盖（首屏有无主视觉/CTA/商品卡）
  hierarchy,      // 应用栏/分区/主次结构
  interaction,    // 导航连线覆盖率、可点元素有无目标
  brandFit,       // seed color 与石影品牌色距离
  notes           // 部件行为备注的数量与质量
}
```

映射为初始 stats（进入既有 `scoreWeights` 计算）：

- `quality`：完整度 + 层级 + 交互综合
- `evidence`：备注写得多且具体（= 有理有据，呼应「凭记录谈分成」）
- `scopeDebt`：部件堆料超阈值（= 范围膨胀，讽刺点：你先做这么多干嘛）
- `energy`：画布操作深度可选消耗（默认不扣，保局时）

### 2.3 老板吐槽联动（讽刺灵魂）

评审文本按结构化发现选台词（脚本规则、无 LLM，守住「AI 不决定评分、只生成/选择评语」原则）。台词库按「发现 ID → 台词」组织，与现有 `reviews.lines` 并轨：

- 首屏无购买 CTA → 「购买入口都找不到，感觉很奇怪。」
- 只有手机屏没有桌面屏（或反之）→ 「老板是用电脑看的，你懂我意思吧。」
- seed color 偏离品牌色 → 「这不是我们石影的颜色，这是哪家的？」
- 部件超阈值 → 「你先做这么多干嘛，排期是你排的吗？」
- 备注全空 → 「开发拿到这个怎么做？你猜？」

导出的中文 prompt 在评审页折叠展示为《交给开发的需求文档.pdf》样式卡片，老板挑刺时高亮对应句子——玩家「看见自己的话被断章取义」是本作核心讽刺体验。

### 2.4 模式兼容与局时控制

- **偷懒模式**：保留现有三选一起手模板（对应「找参考抄一版」），画布模式为默认。fixtures/golden-paths.json 与 T01–T22 测试全部不动；画布路径新增独立测试与金色路径。
- **局时**：默认只画首屏 1 屏（可选消耗精力加画第二屏），目标仍是一局 3–5 分钟。
- **手机端**：用 M3E 自带单屏简化编辑器；桌面端完整编辑器。

## 3. 技术整合

### 3.1 嵌入方式

fork m3e-canvas 进本仓库子目录（如 `vendor/m3e-canvas/`，MIT 声明保留），Next.js `output: export` 静态导出；Vite 构建把静态产物并入 `dist/canvas/`。游戏页同源 iframe 懒加载（评审前才挂载），双向 postMessage 桥：

- 游戏 → 画布：初始模板（屏尺寸、seed color、需求提示、部件白名单）
- 画布 → 游戏：提交时回传设计数据 + 单屏 PNG dataURL（稿件卡用）

不选「抽组件嵌 React」的原因：M3E 是完整 Next.js 应用而非组件库，静态导出 + iframe 是改动量最小、升级可对齐 upstream 的路径。

### 3.2 数据与存档

- 设计序列化直接复用其分享链接格式（实现时读源码确认字段，fork 内冻结该格式）。
- `Run` 增加 `sketch` 可选字段，`schemaVersion` 升 2 并写迁移；存档仍整体进 localStorage。

### 3.3 工程边界

- localStorage 命名空间核查：canvas 的 key 必须与 `guogao:*` 隔离（fork 内统一加前缀）。
- e2e：iframe 用 Playwright frame locator；拖拽不稳定时走「直接注入设计 JSON → 测分析器」的分层策略。
- 体积：静态子应用 MB 级，dist 变大可接受；懒加载避免拖慢开局。

## 4. 多 CLI 协作（codex + agy + ZCode 编排）

### 4.1 角色分工

| 角色 | 职责 | 调用要点 |
|---|---|---|
| ZCode（编排者） | 拆任务、建 worktree、下发、合并、跑门禁、git 提交 | 独占合并权 |
| codex（实现工） | 自包含文件级实现：canvas 静态化、iframe 桥、prototype.ts、视图接线 | `codex exec --cd <worktree> "<任务>"`，非交互 |
| agy（结构化工） | 结构化输出：吐槽台词库、内容校验、风险审查、互审 | `agy -p --json-schema <schema>` 强约束输出；`--mode plan` 做子任务规划；沙箱产物在 `~/.gemini/antigravity-cli/scratch/` 需拷回；macOS 无 `timeout`，用后台 + sleep 控制 |
| 交叉互审 | codex review 审 agy 产出、agy 审 codex diff | `codex review` 可非交互跑代码评审 |

### 4.2 协作协议

1. **共享规格**：任务提示词指向 `docs/m3e-canvas-plan.md` 与 `docs/implementation-decisions.md`，不口头复述需求。
2. **并行隔离**：`git worktree add .worktrees/<流>` 三条流——W1 canvas、W2 engine、W3 content，约束各自可改的目录，互不相碰。
3. **合并门禁**（每条流合并前必过）：
   `pnpm typecheck && pnpm test && pnpm validate:content && python3 tools/verify_spec.py && pnpm build && pnpm test:e2e`

### 4.3 任务分解

- **W1 canvas 子应用**（codex）：fork → 静态导出 → dist 并入 → postMessage 桥 → localStorage 前缀隔离。
- **W2 引擎分析器**（codex）：分享链接解析 + `analyzePrototype` + 计分接线 + 单测（纯函数，可先行）。
- **W3 内容文案**（agy，json-schema 强约束）：发现 ID → 台词库、需求文档卡片文案；产出 JSON 由 ZCode 合入 `game.v1.json`。
- **W4 测试补全**（codex/agy 各半）：画布路径金色路径、e2e frame 用例。
- **W5 互审与合并**（ZCode + codex review）。

## 5. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1（半天） | fork 静态化 + 同源 iframe + hello 桥 | 游戏页能打开画布并收发一条消息 |
| M2 | 分析器 + 计分接线 + 单测 | 新单测全绿，既有 109 单测不动 |
| M3 | 吐槽联动 + 需求文档卡片 | 手动试玩一轮画布→退回闭环 |
| M4 | e2e + 金色路径扩展 + 竖屏实测 | 全门禁绿，WebKit 实测通过 |

M1 与 M2 无依赖，worktree 下并行。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 分享链接格式是 beta，可能变 | fork 冻结版本 + 解析器容错 + golden fixture 固化样例 |
| dist 体积 / 首屏加载 | iframe 懒加载，仅 SKETCH 环节挂载 |
| 画布上手成本拉长局时 | 预置模板起手 + 默认单屏 + 偷懒模式兜底 |
| 手机拖拽体验 | 用其自带单屏简化编辑器；WebKit e2e 实测 |
| 多 CLI 并行改冲突 | worktree 目录隔离 + 门禁 + ZCode 独占合并 |
| upstream 大改难以跟进 | vendor 目录独立 commit 边界，记录 fork 点 commit hash |
