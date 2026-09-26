# vendor 说明

## m3e-canvas

- 来源: https://github.com/lnkiai/m3e-canvas （MIT License, 见 vendor/m3e-canvas/LICENSE 与 NOTICE）
- fork 点: 42a25a2acfb581c17b00c4a1947e1f82d9677500 (2026-09-26 浅克隆, 移除其 .git)
- 用途: 过稿模拟器「画原型」环节的嵌入画布。以 `NEXT_PUBLIC_BASE_PATH=/canvas` 静态导出后拷贝到 `public/canvas/`，游戏页同源 iframe 加载。
- 构建: `node tools/build-canvas.mjs`（内部执行 npm ci + npm run build 并拷贝 out/ → public/canvas/）
- 上游更新: 重浅克隆至新目录后替换本目录, 更新本文件 fork 点。
