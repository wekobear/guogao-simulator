/**
 * 拼装编辑器 → M3E 兼容 Doc 的纯函数转换（src/game 无浏览器依赖）。
 *
 * 玩家在轻量编辑器里排出的部件（种类、变体、顺序、备注、品牌色、导航连接）
 * 被转换为与 m3e-canvas 画布完全同构的文档：桌面 1280×800 + 手机竖屏 412×892
 * 双帧，部件按顺序垂直排列——顺序与空间直接落在几何坐标（y 递增）上，
 * 交给既有 analyzeSketch 做真实检查，不写死任何分数。
 */

export type PartKind = 'nav' | 'hero' | 'title' | 'specs' | 'cta' | 'bullets' | 'footer' | 'note';

export type AssemblyPart = {
  id: string;
  kind: PartKind;
  variant: string;
  /** 可编辑文本（标题/备注块正文）；未填用变体默认文案 */
  text?: string;
  /** 行为备注：写入部件 note，analyzeSketch 的「行为备注」检查读这里 */
  note?: string;
};

export type AssemblyState = {
  parts: AssemblyPart[];
  brandColor: string;
  /** 导航连接到手机竖屏（生成 action.to，满足「页面导航」检查的前提） */
  navLinked: boolean;
};

export type PartVariant = { key: string; label: string; desc: string };
export type PartDef = { name: string; icon: string; variants: PartVariant[] };

/** 部件目录：8 类，每类 2–3 个预设变体（影响预览视觉与 Doc 文案） */
export const PART_CATALOG: Record<PartKind, PartDef> = {
  nav: {
    name: '导航栏',
    icon: '☰',
    variants: [
      { key: 'bar', label: '悬浮通栏', desc: '顶部品牌条，可连接到手机屏' },
      { key: 'burger', label: '极简汉堡', desc: '右下角小按钮，也可连接手机屏' },
      { key: 'none', label: '全屏沉浸', desc: '不放导航——需求里的「页面导航」会查你' },
    ],
  },
  hero: {
    name: '主视觉',
    icon: '▣',
    variants: [
      { key: 'mud_splash', label: '泥地飞溅特写', desc: '极限运动氛围，硬核运动感' },
      { key: 'studio_side', label: '产品正侧视图', desc: '稳妥行货，产品清晰可见' },
      { key: 'sticker', label: '参数贴纸拼贴', desc: '贴纸风标注，极客味' },
    ],
  },
  title: {
    name: '大标题',
    icon: 'T',
    variants: [
      { key: 'big', label: '大字冲击', desc: '一句话卖点放大' },
      { key: 'pair', label: '主副组合', desc: '主标题 + 副标题两行' },
    ],
  },
  specs: {
    name: '核心参数',
    icon: '⚙',
    variants: [
      { key: 'icon_grid', label: '三防图标排阵', desc: '图标 + 短词，易读性高' },
      { key: 'table', label: '跑分大表格', desc: '领导看不懂但觉得专业' },
      { key: 'slogan', label: '只放金句', desc: '无参数，纯酷炫文案' },
    ],
  },
  cta: {
    name: '立即购买 CTA',
    icon: '⬤',
    variants: [
      { key: 'hardcore', label: '红黑硬朗按钮', desc: '「立即购买」，行动感强' },
      { key: 'flash', label: '倒计时立减', desc: '电商味拉满，注意力强' },
      { key: 'minimal', label: '极简入口', desc: '克制的「立即购买」链接' },
    ],
  },
  bullets: {
    name: '卖点清单',
    icon: '≡',
    variants: [
      { key: 'three', label: '三条卖点', desc: '场景化罗列' },
      { key: 'numbers', label: '数字冲击', desc: '用数字说话' },
    ],
  },
  footer: {
    name: '页脚',
    icon: '▁',
    variants: [{ key: 'plain', label: '常规页脚', desc: '品牌信息与链接' }],
  },
  note: {
    name: '备注块',
    icon: '✎',
    variants: [
      { key: 'req', label: '需求备注', desc: '写给开发的说明（满足行为备注检查）' },
      { key: 'risk', label: '风险备注', desc: '标注待确认项' },
    ],
  },
};

export const PART_ORDER: PartKind[] = ['nav', 'hero', 'title', 'specs', 'cta', 'bullets', 'footer', 'note'];

/* ---------------- 部件 → M3E 部件（kind / 尺寸 / 文案） ---------------- */

type DocItem = {
  id: string;
  kind: string;
  label: string;
  icon: null;
  variant: string;
  note?: string;
  action?: { to: string };
  size?: number;
  size2?: number;
};

type DocGroup = { id: string; x: number; y: number; axis: 'x' | 'y'; items: DocItem[] };
type DocFrame = { id: string; name: string; x: number; y: number; w: number; h: number };
export type M3eDoc = {
  title: string;
  brief: string;
  customPalette: { primary: string };
  frames: DocFrame[];
  groups: DocGroup[];
};

export const HOME_FRAME_ID = 'sketch-home';
export const PHONE_FRAME_ID = 'sketch-phone';

const DEFAULT_TITLE_TEXT: Record<string, string> = {
  big: '石影 X1，拍下每一次心跳',
  pair: '石影 X1 · 为极限而生',
};

const DEFAULT_NOTE_TEXT: Record<string, string> = {
  req: '需求备注：首屏主视觉与立即购买不可替换。',
  risk: '风险备注：跑分数据待产品确认后再上。',
};

function variantLabel(part: AssemblyPart): string {
  const def = PART_CATALOG[part.kind];
  const v = def.variants.find((x) => x.key === part.variant) ?? def.variants[0]!;
  return v.label;
}

/** 每个部件在桌面/手机两种视口下的 M3E 映射（kind、尺寸、文案、备注、导航动作） */
function partToItems(
  state: AssemblyState,
  part: AssemblyPart,
  target: 'desktop' | 'mobile',
): { item: DocItem; h: number } {
  const pid = `${part.id}-${target === 'desktop' ? 'd' : 'm'}`;
  const note = part.note && part.note.trim().length > 0 ? part.note.trim() : undefined;
  const link = state.navLinked ? { to: PHONE_FRAME_ID } : undefined;
  switch (part.kind) {
    case 'nav': {
      if (part.variant === 'none') {
        const item: DocItem = { id: pid, kind: 'text', label: '沉浸式全屏（无导航）', icon: null, variant: 'filled', note };
        return { item, h: Math.round(20 * 1.3) };
      }
      if (part.variant === 'burger') {
        const item: DocItem = {
          id: pid, kind: 'iconButton', label: '菜单', icon: null, variant: 'filled', note,
          ...(link ? { action: link } : {}), size: 56,
        };
        return { item, h: 56 };
      }
      const size = target === 'desktop' ? 1280 : 412;
      const size2 = target === 'desktop' ? 72 : 64;
      const item: DocItem = {
        id: pid, kind: 'topAppBar', label: '石影 X1 · 新品首发', icon: null, variant: 'filled', note,
        ...(link ? { action: link } : {}), size, size2,
      };
      return { item, h: target === 'desktop' ? 72 : 88 };
    }
    case 'hero': {
      const size = target === 'desktop' ? 1280 : 412;
      const size2 = target === 'desktop' ? 420 : 260;
      const label = `主视觉：${variantLabel(part)}`;
      const item: DocItem = { id: pid, kind: 'image', label, icon: null, variant: 'filled', note, size, size2 };
      return { item, h: size2 };
    }
    case 'title': {
      const size = target === 'desktop' ? 56 : 30;
      const text = part.text?.trim() || DEFAULT_TITLE_TEXT[part.variant] || DEFAULT_TITLE_TEXT.big!;
      const item: DocItem = { id: pid, kind: 'text', label: text, icon: null, variant: 'filled', note, size };
      return { item, h: Math.round(size * 1.3) };
    }
    case 'specs': {
      if (part.variant === 'slogan') {
        const size = target === 'desktop' ? 40 : 24;
        const item: DocItem = { id: pid, kind: 'text', label: '一寸轻，一寸稳，一寸快。', icon: null, variant: 'filled', note, size };
        return { item, h: Math.round(size * 1.3) };
      }
      const size = target === 'desktop' ? (part.variant === 'table' ? 1100 : 900) : 380;
      const label = part.variant === 'table' ? '核心参数：跑分大表格' : '核心参数：三防图标排阵';
      const item: DocItem = { id: pid, kind: 'card', label, icon: null, variant: 'filled', note, size };
      const h = Math.round(size * 0.5875);
      return { item, h };
    }
    case 'cta': {
      const labels: Record<string, string> = {
        hardcore: '立即购买',
        flash: '限时立减 ¥2999 · 立即购买',
        minimal: '立即购买 →',
      };
      const size = target === 'desktop' ? 360 : 300;
      const item: DocItem = {
        id: pid, kind: 'button', label: labels[part.variant] ?? '立即购买', icon: null,
        variant: part.variant === 'minimal' ? 'text' : 'filled', note, size, size2: 72,
      };
      return { item, h: 72 };
    }
    case 'bullets': {
      const label =
        part.variant === 'numbers'
          ? '4K/120fps · 19 分钟极速满电 · 1.2 米五防跌落'
          : '滑雪不冻机 · 骑行防抖 · 潜水 10 米';
      const size = target === 'desktop' ? 1280 : 380;
      const item: DocItem = { id: pid, kind: 'listItem', label, icon: null, variant: 'filled', note, size };
      return { item, h: 72 };
    }
    case 'footer': {
      const size = target === 'desktop' ? 14 : 12;
      const item: DocItem = { id: pid, kind: 'text', label: '石影 SHIYING © 2026 · 官方商城 · 售后政策', icon: null, variant: 'filled', note, size };
      return { item, h: Math.round(size * 1.3) };
    }
    case 'note': {
      const size = target === 'desktop' ? 16 : 13;
      const text = part.text?.trim() || DEFAULT_NOTE_TEXT[part.variant] || DEFAULT_NOTE_TEXT.req!;
      // 备注块：正文即 note，保证「行为备注」检查有真实来源
      const item: DocItem = { id: pid, kind: 'text', label: `备注：${text}`, icon: null, variant: 'filled', note: text, size };
      return { item, h: Math.round(size * 1.3) };
    }
  }
}

/**
 * 把拼装状态转换为 M3E Doc。
 * 桌面帧与手机帧各自按 parts 顺序垂直排布（y 随顺序递增），
 * 空状态仍生成双帧（无部件）——analyzeSketch 会给出「原型尚无屏幕或部件」。
 */
export function assemblyToDoc(state: AssemblyState, opts?: { title?: string; brief?: string }): M3eDoc {
  const groups: DocGroup[] = [];
  const cursor = { desktop: 0, mobile: 0 };
  const gap = { desktop: 24, mobile: 18 };
  for (const part of state.parts) {
    for (const target of ['desktop', 'mobile'] as const) {
      const { item, h } = partToItems(state, part, target);
      const x = target === 'desktop' ? 0 : 1400;
      const y = cursor[target];
      groups.push({ id: `asm-g-${part.id}-${target === 'desktop' ? 'd' : 'm'}`, x, y, axis: 'y', items: [item] });
      cursor[target] += h + gap[target];
    }
  }
  // 帧高随内容增长：保证部件中心始终落在所属帧内（analyzeSketch 按中心点归帧）
  return {
    title: opts?.title ?? '石影 X1 上新落地页',
    brief: opts?.brief ?? '',
    customPalette: { primary: normalizeHex(state.brandColor) ?? '#FF5722' },
    frames: [
      { id: HOME_FRAME_ID, name: '首页（桌面）', x: 0, y: 0, w: 1280, h: Math.max(800, cursor.desktop + 48) },
      { id: PHONE_FRAME_ID, name: '首屏（手机竖屏）', x: 1400, y: 0, w: 412, h: Math.max(892, cursor.mobile + 48) },
    ],
    groups,
  };
}

/**
 * 数转换后 Doc 里带行为备注的部件数（同一部件的桌面/手机双帧按部件去重）。
 * 交稿确认的「含行为备注」计数与 analyzeSketch 的「行为备注」检查同源：
 * 备注块的默认文案、手填 note 都算，空 note 不算。
 */
export function countDocNotes(doc: M3eDoc): number {
  const seen = new Set<string>();
  for (const group of doc.groups) {
    for (const item of group.items) {
      if (typeof item.note === 'string' && item.note.trim().length > 0) {
        seen.add(item.id.replace(/-(d|m)$/, ''));
      }
    }
  }
  return seen.size;
}

/* ---------------- 状态构造 / 校验 ---------------- */

let idCounter = 0;
/** 生成部件 id（仅区分用，不参与判定） */
export function newPartId(): string {
  idCounter += 1;
  return `p${Date.now().toString(36)}${idCounter}`;
}

export function defaultAssembly(): AssemblyState {
  return { parts: [], brandColor: '#FF5722', navLinked: true };
}

function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let hex = v.trim();
  if (/^#[\da-f]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map((c) => c + c).join('');
  if (!/^#[\da-f]{6}$/i.test(hex)) return null;
  return hex.toLowerCase();
}

const isPartKind = (v: unknown): v is PartKind =>
  typeof v === 'string' && PART_ORDER.includes(v as PartKind);

/** 防御式解析（草稿可能被外部写坏）：结构不对返回 null，由调用方回落默认 */
export function parseAssemblyState(v: unknown): AssemblyState | null {
  if (typeof v !== 'object' || v === null) return null;
  const raw = v as Record<string, unknown>;
  if (!Array.isArray(raw.parts)) return null;
  const parts: AssemblyPart[] = [];
  for (const p of raw.parts) {
    if (typeof p !== 'object' || p === null) return null;
    const part = p as Record<string, unknown>;
    if (!isPartKind(part.kind) || typeof part.variant !== 'string') return null;
    if (part.id !== undefined && typeof part.id !== 'string') return null;
    if (part.text !== undefined && typeof part.text !== 'string') return null;
    if (part.note !== undefined && typeof part.note !== 'string') return null;
    parts.push({
      id: typeof part.id === 'string' ? part.id : newPartId(),
      kind: part.kind,
      variant: part.variant,
      ...(part.text !== undefined ? { text: part.text } : {}),
      ...(part.note !== undefined ? { note: part.note } : {}),
    });
  }
  const brand = normalizeHex(raw.brandColor) ?? '#FF5722';
  return { parts, brandColor: brand, navLinked: raw.navLinked !== false };
}

/** 深拷贝（草稿保存前隔离引用） */
export function cloneAssembly(state: AssemblyState): AssemblyState {
  return {
    parts: state.parts.map((p) => ({ ...p })),
    brandColor: state.brandColor,
    navLinked: state.navLinked,
  };
}
