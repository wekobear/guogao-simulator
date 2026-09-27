# Third-Party Notices

本项目（过稿模拟器）除自研代码外使用到以下第三方资产。各条目保留上游要求的许可声明与署名。

## Reicon 图标（src/components/icons.tsx）

- 来源仓库: <https://github.com/dqev/reicon>（MIT License）
- 提取的图标（均为 Outline 线性风格，24×24，path 数据逐字节取自官方数据文件，未做修改）:
  - `help-circle`（分类 ui）→ `HelpCircleIcon`（顶栏「玩法说明」）
  - `gallery`（分类 video）→ `GalleryIcon`（顶栏「结局图鉴」）
  - `settings`（分类 settings）→ `SettingsIcon`（顶栏「设置」）
- 数据文件: `data/icon-data.json` @ commit `7798dd13ce8788f584f2e1e177f4faa92e422e8c`（main, 2026-09-27）
  - <https://github.com/dqev/reicon/blob/7798dd13ce8788f584f2e1e177f4faa92e422e8c/data/icon-data.json>
- 许可原文: <https://github.com/dqev/reicon/blob/main/LICENSE>

```text
MIT License

Copyright (c) 2025 REICON
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Reicon 上游 Credits（照录自其 README）

- [Solar Icons](https://solar-icons.vercel.app/) designed by **480 Design** (CC BY 4.0)
- [Zappicon](https://zappicon.com/)

## m3e-canvas（vendor/m3e-canvas）

见 `vendor/m3e-canvas/LICENSE` 与 `vendor/m3e-canvas/NOTICE`（MIT，fork 点 42a25a2，用途与构建方式见 `vendor/README.md`）。
