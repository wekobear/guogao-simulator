/**
 * M3E Canvas 桥（docs/m3e-canvas-plan.md §3）
 *
 * 画布是同源 iframe 加载的静态子应用（public/canvas/，由 vendor/m3e-canvas 构建）。
 * 数据通道不依赖 postMessage：
 *  - 种子：iframe 挂载前，把初始 Doc 写进它启动时读取的 localStorage key（m3e:doc）
 *  - 回读：编辑器边改边存同一个 key，交稿时直接解析
 */

/** vendor/m3e-canvas/app/Editor.tsx 的 DOC_KEY */
export const CANVAS_DOC_KEY = 'm3e:doc';

/** 石影品牌橙；与 src/game/prototype.ts 的 BRAND_PRIMARY 保持一致 */
export const SKETCH_BRAND_PRIMARY = '#FF5722';

type SeedFrame = {
  id: string;
  name: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
};

type SeedItem = {
  id: string;
  kind: string;
  label: string;
  icon: string | null;
  variant: string;
  note?: string;
};

type SeedGroup = {
  id: string;
  x: number;
  y: number;
  axis: 'x' | 'y';
  items: SeedItem[];
};

type SeedDoc = {
  title: string;
  brief: string;
  customPalette: { primary: string };
  frames: SeedFrame[];
  groups: SeedGroup[];
};

/** 起手原型：桌面首页 + 手机竖屏双屏、品牌橙、两条提示部件 */
function buildSeedDoc(requirementLines: string[]): SeedDoc {
  return {
    title: '石影 X1 上新落地页',
    brief: requirementLines.join(' '),
    customPalette: { primary: SKETCH_BRAND_PRIMARY },
    frames: [
      { id: 'sketch-home', name: '首页（桌面）', x: 0, y: 0, w: 1280, h: 800 },
      { id: 'sketch-phone', name: '首屏（手机竖屏）', x: 1400, y: 0, w: 412, h: 892 },
    ],
    groups: [
      {
        id: 'sketch-g-bar',
        x: 0,
        y: 0,
        axis: 'x',
        items: [
          {
            id: 'sketch-i-bar',
            kind: 'topAppBar',
            label: '石影 X1 · 新品首发',
            icon: null,
            variant: 'filled',
          },
        ],
      },
      {
        id: 'sketch-g-hint',
        x: 32,
        y: 104,
        axis: 'y',
        items: [
          {
            id: 'sketch-i-hint',
            kind: 'box',
            label: '主视觉 + 核心参数放这里',
            icon: null,
            variant: 'filled',
            note: '需求：产品图与核心参数不可替换；首屏要有「立即购买」。',
          },
        ],
      },
    ],
  };
}

/** 在 iframe 挂载前写入种子文档（同源共享 localStorage）；写入失败时画布以空文档起手 */
export function seedSketchCanvas(requirementLines: string[]): void {
  try {
    localStorage.setItem(CANVAS_DOC_KEY, JSON.stringify(buildSeedDoc(requirementLines)));
  } catch {
    // 隐私模式等场景：忽略，玩家仍可画
  }
}

/** 读取画布当前文档；无文档或无法解析时返回 null */
export function readSketchDoc(): unknown {
  try {
    const raw = localStorage.getItem(CANVAS_DOC_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
