# 过稿模拟器

一款短局职场讽刺网页游戏：你是虚构公司「差不多创意部」的设计师，在雕茅经理「感觉很奇怪」的退回意见、抢功的分成方案和层出不穷的职场插曲中，争取过稿、保住精力、拿回应得的奖金。

- 简体中文 · 手机竖屏优先（桌面可用）
- 纯前端（React + TypeScript + Vite），无后端、无登录、无模型密钥
- 一局 3–5 分钟；一局最多提交三次；六种结局全部可达
- 所有奖金均为游戏内虚构数字；本游戏不代表真实设计评审水平

## 快速开始

```bash
pnpm install
pnpm dev          # 开发：http://localhost:5173
```

其他命令：

| 命令 | 说明 |
|---|---|
| `pnpm build` | 生产构建，输出 `dist/` |
| `pnpm preview` | 本地 HTTP 预览生产构建（http://localhost:4173） |
| `pnpm test` | Vitest 单元测试（规则、随机、存档、六条金色路径） |
| `pnpm test:e2e` | Playwright 浏览器测试（Chromium + WebKit，对生产构建运行） |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint |
| `pnpm validate:content` | 内容数据结构与引用校验 |

`python3 tools/verify_spec.py` 为规格级校验器（内容数值自洽 + 六结局可达性搜索 + 生成 `fixtures/golden-paths.json`）。

## 玩法速览

1. 读需求，三选一起手方案（信息优先 / 视觉大字 / 常规卡片），或选**认真模式**：第一轮在嵌入的 M3E 画布上亲手拼原型（主视觉、立即购买、手机竖屏、页面导航、行为备注），引擎按需求逐条检查并计入指标。
2. 每轮选一个准备动作并提交；评审给出过稿指数（S/A/B/C/D）与通过/退回原因；认真模式会附「原型检查」清单和雕茅经理的逐条吐槽。
3. 退回后回应老板（追问 / 全答应 / 摆依据），再处理一个职场插曲（六选二，按权重抽取）。
4. 过稿进入分奖金（1000 游戏币）：接受老板 70/75/80% 的起手分成，或凭证与信任都 ≥ 40 时「凭记录谈分成」拿回 75%。
5. 庆功红包二选一，然后看结局、复制结果卡、重玩。

结局：过稿·硬气版 / 过稿·和气版 / 燃尽 / 优化毕业 / 无限改稿循环 / 主动下班。

线上地址：<https://guogao-simulator.netlify.app>（Netlify，`main` 推送自动构建）。

### 认真模式（画原型）说明

- 画布来自 [m3e-canvas](https://github.com/lnkiai/m3e-canvas)（MIT），vendored 于 `vendor/m3e-canvas`，`pnpm build:canvas` 以 `/canvas` 为基路径静态构建并拷入 `public/canvas/`（已存在则跳过，`--force` 重建）。
- 游戏页同源 iframe 懒加载画布；种子原型经 localStorage（`m3e:doc`）注入，交稿时读回并交给纯函数分析器 `src/game/prototype.ts`（带 40 条单测）。
- Boss 台词库在 `src/content/sketchLines.ts`，由 AI（Antigravity）按方案生成、人工定稿；评分仍由脚本规则决定。

## 目录结构

```
src/game/         纯规则引擎：types / scoring / random / reducer / selectors
src/content/      game.v1.json 全部数值与台词；schema.ts Zod 校验
src/services/     storage（存档/图鉴/多标签）· images（本地选图）· reviewText（脚本评语适配层）
src/views/        九个视图（首页→需求→工作台→评审→回应→插曲→奖金→庆功→结局）
src/components/   指标面板、稿件预览、选项卡、弹窗等
src/styles/       主题样式（审批单视觉）
tests/unit/       规则与边界测试（T01–T22）
tests/e2e/        浏览器验收（金色路径重放 + 交互细节）
fixtures/         golden-paths.json：六结局固定种子与操作序列
tools/            verify_spec.py / validate-content.ts
docs/             实现决策记录、验收记录
```

## 存档与隐私

- 进度自动保存在本浏览器 localStorage（`guogao:run:v1` 等）；结局图鉴独立保存。
- 自选图片仅在本机展示：不上传、不持久化、不写日志、不参与评分；刷新后回到内置示例稿。
- 无任何外部网络请求（开发模式的本地埋点除外，仅 console）。

## 已知边界

- 已本地验证（Chromium + WebKit 自动化 + 人工试玩），**尚未公开部署**。
- 微信内兼容性未做实机验证；公开分享前需在目标手机微信浏览器实测。
- 二期「AI 看图吐槽」仅保留 `ReviewTextProvider` 接口，首版无网络评语，无不可用开关。
- 分享为「可截图结果卡 + 复制文本」，未实现长图下载与系统分享面板。
