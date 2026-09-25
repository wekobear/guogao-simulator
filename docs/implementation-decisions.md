# 实现决策记录

日期：2026-09-24 · 项目：过稿模拟器首版

本文件记录开发过程中偏离或补充开发总纲的具体决策，供回溯。

## D1 总纲配套 ZIP 缺失，内容数据按总纲规则重建

总纲称「结构化台词、六种结局路径和规则校验器在 ZIP 内」，但整个磁盘只找到总纲 md 本身。处置：

- 数值规则（评分公式、通过条件、等级边界、奖金数学、结局优先级、随机算法、T01–T22 用例）以总纲正文为准，逐条实现；
- 台词、三起手、五准备动作、三回应、六插曲的具体文案与 delta 数值为本实现自拟，经 `tools/verify_spec.py` 校验：内容自洽、六结局 + S 级路径全部可达（种子 1）；
- `fixtures/golden-paths.json` 由校验器搜索生成，非手工编写；
- 总纲「校验记录」一节引用的最终指标表属于原 ZIP 内容，与本实现的数值不同属正常现象。

## D2 技术栈与版本

React 19 + TypeScript 5.9 + Vite 7 + 普通 CSS + Zod 4；测试 Vitest 3 + Playwright（Chromium/WebKit）。单路由状态视图（`phase` 驱动渲染），避免静态主机子路由 404；浏览器后退不映射为撤销（总纲要求）。实际版本以 `pnpm-lock.yaml` 为准。

## D3 随机与幂等

- LCG 按总纲公式实现；`next_u32(1) = 1015568748`（总纲未给出该常量，由公式直接计算）。
- 每个动作带 `{runId, expectedSeq}`；reducer 校验失败返回原引用，双击第二次自然丢弃。
- `?seed=N` URL 参数用于测试注入（生产包不显示任何调试 UI，dev 面板仅 `import.meta.env.DEV` 出现）；正常游玩用 `crypto.getRandomValues`。

## D4 图片处理

- 魔数嗅探实际类型（JPEG/PNG/WebP），不信任 `accept`；≤ 8 MiB；`createImageBitmap` 解码校验；解码后 ≤ 2000 万像素；预览用 canvas 缩到最长边 1600px 的 Blob URL；替换/移除/换局时 `revokeObjectURL`。
- 自选图不写入存档：Run 仅记 `hadCustomImage` 布尔值，刷新后提示重选（总纲要求）。

## D5 存档

- keys：`guogao:run:v1` / `guogao:collection:v1` / `guogao:settings:v1`。
- 加载时做结构 + 不变量校验（round、phase、reviews 数、EVENT/BONUS/ENDING 前置条件等），坏档弹出可确认的「重新开局」弹窗，不静默覆盖；图鉴保留。
- localStorage 不可用/写入失败 → 内存模式 + 常驻提示，游戏可完整进行。
- 多标签页：`storage` 事件比对 runId/seq，旧页暂停操作并给出「从另一页同步 / 本页新开」两个出口。

## D6 美术资源

- 全部稿件、头像、印章以 CSS/SVG 程序绘制（总纲要求，无真人肖像、无 BGM）。
- 首页装饰插画 `src/assets/hero.svg` 与结局印章 `src/assets/stamp.svg` 由本地 Agy CLI 生成后人工审校接入（用户指定的工作流）；SVG 解析校验通过，加载失败时自动隐藏不留破图。

## D7 埋点

仅开发模式 `console.debug` 输出 `game_start` / `review_complete` / `choice_made` / `ending_reached` / `copy_result`，字段不含自选图、文件名或自由文本。生产无任何外发。

## D8 e2e 对生产构建运行

`playwright.config.ts` 的 webServer 是 `pnpm build && pnpm preview`，因此 e2e 同时覆盖「生产预览无未捕获错误」（B14）。金色路径用例通过真实点击到达结局，不直接把 state 设成 ENDING。
