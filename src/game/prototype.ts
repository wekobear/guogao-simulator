import type { StatsDelta } from './types';

// Minimal frozen projection of vendor/m3e-canvas/lib/tokens.ts. Importing that
// module pulls editor code with incompatible compiler rules into the game.
type Frame = { id: string; name: string; x: number; y: number; w?: number; h?: number };
type Action = { to: string };
type Item = { id: string; kind: string; label: string; variant: string; icon: null;
  note?: string; action?: Action; actions?: Record<string, Action>; size?: number; size2?: number;
  tabs?: unknown[]; layout?: string; railExpanded?: boolean; railModal?: boolean };
type Group = { id: string; x: number; y: number; axis: 'x' | 'y'; items: Item[];
  free?: boolean; pos?: Record<string, { x: number; y: number }> };
const DIMENSIONS: Record<string, [number, number]> = {
  button: [128, 56], iconButton: [56, 56], fab: [56, 56], extendedFab: [128, 56],
  splitButton: [128, 56], fabMenu: [220, 56], chip: [128, 32], topAppBar: [412, 88],
  bottomNav: [412, 104], navRail: [80, 892], toolbar: [64, 64], tabs: [412, 48],
  searchBar: [380, 56], card: [380, 223], listItem: [380, 72], box: [412, 220],
  bottomSheet: [412, 320], dialog: [312, 220], snackbar: [344, 48], textField: [380, 56],
  select: [380, 56], switch: [160, 48], checkbox: [128, 40], radio: [128, 40],
  slider: [380, 44], datePicker: [328, 444], timePicker: [328, 452], text: [120, 36],
  image: [200, 200], carousel: [412, 180], camera: [380, 507], map: [380, 285],
  divider: [380, 16], loadingIndicator: [48, 48], linearProgress: [380, 24], circularProgress: [48, 48],
};
const KIND_ORDER = Object.keys(DIMENSIONS);
const VARIANTS = ['filled', 'tonal', 'elevated', 'outlined', 'text'].map(key => ({ key }));
const TAPPABLE = ['button', 'iconButton', 'fab', 'extendedFab', 'chip', 'listItem', 'card',
  'image', 'text', 'splitButton', 'radio', 'datePicker', 'timePicker'];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
function dimensions(it: Item): [number, number] {
  const [w, h] = DIMENSIONS[it.kind];
  const n = it.size ?? w;
  switch (it.kind) {
    case 'button': return [n, clamp(it.size2 ?? 56, 32, 136)];
    case 'extendedFab': return [128, clamp(it.size2 ?? 56, 56, 96)];
    case 'splitButton': return [128, clamp(it.size2 ?? 56, 32, 136)];
    case 'chip': return [128, clamp(it.size2 ?? 32, 32, 56)];
    case 'checkbox': case 'radio': return [128, h];
    case 'fabMenu': return [n, 56 + (it.tabs?.length ?? 0) * 64];
    case 'toolbar': {
      const count = Math.max(1, it.tabs?.length ?? 0);
      return [16 + count * 48 + (count - 1) * 4, h];
    }
    case 'text': return [120, Math.round((it.size ?? 28) * 1.3)];
    case 'fab': case 'iconButton': case 'loadingIndicator': case 'circularProgress': return [n, n];
    case 'image': return [n, it.size2 ?? n];
    case 'camera': return [n, it.size2 ?? Math.round(n * 4 / 3)];
    case 'map': return [n, it.size2 ?? Math.round(n * 3 / 4)];
    case 'card': return [n, it.size2 ?? Math.round(n * 0.5875)];
    case 'topAppBar': return [n, clamp(it.size2 ?? 64, 64, 152) + (n > 412 ? 0 : 24)];
    case 'box': case 'bottomSheet': case 'carousel': return [n, it.size2 ?? h];
    case 'navRail': return [it.railExpanded ? 220 : it.railExpanded !== undefined || it.railModal ? 96 : 80, it.size2 ?? h];
    case 'datePicker': return [n, it.layout === 'input' ? 96 :
      (it.layout === 'docked' ? 120 : 164) + Math.round((n - 48) / 7) * 7];
    case 'timePicker': return [n, it.layout === 'input' ? 204 : 196 + Math.min(256, n - 48)];
    case 'dialog': case 'snackbar': return [w, h];
    default: return [n, h];
  }
}
function frameOfGroup(g: Group, frames: Frame[]): Frame | undefined {
  let l = g.x, r = g.x, t = g.y, b = g.y, offset = 0;
  for (const it of g.items) {
    const [w, h] = dimensions(it);
    const pos = g.free ? g.pos?.[it.id] ?? { x: 0, y: 0 } :
      { x: g.axis === 'x' ? offset : 0, y: g.axis === 'y' ? offset : 0 };
    l = Math.min(l, g.x + pos.x); r = Math.max(r, g.x + pos.x + w);
    t = Math.min(t, g.y + pos.y); b = Math.max(b, g.y + pos.y + h);
    offset += (g.axis === 'x' ? w : h) + 3;
  }
  const cx = (l + r) / 2, cy = (t + b) / 2;
  return frames.find(f => cx >= f.x && cx <= f.x + (f.w ?? 412) && cy >= f.y && cy <= f.y + (f.h ?? 892));
}

export type SketchFindingId =
  | 'sketch:unreadable' | 'sketch:empty' | 'sketch:no-cta' | 'sketch:no-hero'
  | 'sketch:no-phone' | 'sketch:no-nav' | 'sketch:off-brand' | 'sketch:overbuilt' | 'sketch:no-notes';

export const BRAND_PRIMARY = '#FF5722';

export type SketchAnalysis = {
  findings: SketchFindingId[];
  quality: number;
  statsDelta: StatsDelta;
  summary: string[];
};

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function requireValid(condition: boolean): asserts condition {
  if (!condition) throw new Error('Invalid sketch');
}
function list(v: unknown): unknown[] {
  if (v === undefined) return [];
  requireValid(Array.isArray(v));
  return v;
}
function rgb(v: unknown): number[] | undefined {
  if (typeof v !== 'string') return undefined;
  let hex = v.trim();
  if (/^#[\da-f]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(c => c + c).join('');
  if (!/^#[\da-f]{6}$/i.test(hex)) return undefined;
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}

/** Validate boundary data before applying the canvas geometry rules. */
export function analyzeSketch(doc: unknown): SketchAnalysis {
  try {
    requireValid(record(doc));
    const frames = list(doc.frames).map((value): Frame => {
      requireValid(record(value) && nonempty(value.id));
      for (const key of ['x', 'y', 'w', 'h']) {
        requireValid(value[key] === undefined || finite(value[key]));
      }
      requireValid((value.w === undefined || (value.w as number) > 0) &&
        (value.h === undefined || (value.h as number) > 0));
      return { id: value.id, name: '', x: (value.x as number | undefined) ?? 0,
        y: (value.y as number | undefined) ?? 0, w: value.w as number | undefined, h: value.h as number | undefined };
    });
    requireValid(new Set(frames.map(f => f.id)).size === frames.length);
    const groups = list(doc.groups).map((value, index): Group => {
      requireValid(record(value));
      requireValid(value.x === undefined || finite(value.x));
      requireValid(value.y === undefined || finite(value.y));
      requireValid(value.axis === undefined || value.axis === 'x' || value.axis === 'y');
      requireValid(value.free === undefined || typeof value.free === 'boolean');
      if (value.pos !== undefined) {
        requireValid(record(value.pos));
        for (const pos of Object.values(value.pos)) requireValid(record(pos) && finite(pos.x) && finite(pos.y));
      }
      const items = list(value.items).map((raw, i): Item => {
        requireValid(record(raw) && typeof raw.kind === 'string' && KIND_ORDER.includes(raw.kind as Item['kind']));
        requireValid(raw.label === undefined || typeof raw.label === 'string');
        requireValid(raw.note === undefined || typeof raw.note === 'string');
        requireValid(raw.variant === undefined || VARIANTS.some(v => v.key === raw.variant));
        for (const key of ['size', 'size2', 'count']) requireValid(raw[key] === undefined || (finite(raw[key]) && raw[key] > 0));
        if (raw.tabs !== undefined) requireValid(Array.isArray(raw.tabs) && raw.tabs.every(record));
        const checkAction = (action: unknown) => {
          requireValid(record(action) && typeof action.to === 'string');
        };
        if (raw.action !== undefined) checkAction(raw.action);
        if (raw.actions !== undefined) {
          requireValid(record(raw.actions));
          Object.values(raw.actions).forEach(checkAction);
        }
        return { ...raw, id: typeof raw.id === 'string' ? raw.id : `${index}:${i}`,
          label: (raw.label as string | undefined) ?? '', icon: null,
          variant: (raw.variant as Item['variant'] | undefined) ?? 'filled' } as Item;
      });
      return { id: String(index), x: (value.x as number | undefined) ?? 0,
        y: (value.y as number | undefined) ?? 0, axis: (value.axis as Group['axis'] | undefined) ?? 'y',
        items, free: value.free as boolean | undefined, pos: value.pos as Group['pos'] };
    });
    const items = groups.flatMap(g => g.items);
    if (!frames.length || !items.length) return {
      findings: ['sketch:empty'], quality: 0, statsDelta: { quality: -6 }, summary: ['原型尚无屏幕或部件'],
    };

    const home = frames.find(f => (f.w ?? 412) >= 1000) ?? frames[0];
    // Doc has global groups, not frame.groups or group.frameId. Use the same
    // centre-in-frame rule as the canvas, with its default unmeasured widths.
    const homeItems = groups.filter(g => frameOfGroup(g, frames)?.id === home.id).flatMap(g => g.items);
    const phone = frames.some(f => (f.w ?? 412) < 1000);
    const cta = homeItems.some(it => (TAPPABLE.includes(it.kind) || it.kind === 'fabMenu') &&
      /立即购买|购买|下单|预订|buy|shop|order|reserve/i.test(it.label));
    const hero = homeItems.some(it => it.kind === 'image' || it.kind === 'camera');
    const ids = new Set(frames.map(f => f.id));
    const navigable = items.filter(it => [it.action, ...Object.values(it.actions ?? {})]
      .some(a => a !== undefined && ids.has(a.to))).length;
    const notes = items.filter(it => nonempty(it.note)).length;
    const primary = record(doc.customPalette) ? rgb(doc.customPalette.primary) : undefined;
    const brand = rgb(BRAND_PRIMARY)!;
    const onBrand = (doc.paletteKey === undefined || doc.paletteKey === 'custom') && primary !== undefined &&
      Math.hypot(...primary.map((c, i) => c - brand[i])) <= 120;
    const findings: SketchFindingId[] = [];
    if (!cta) findings.push('sketch:no-cta');
    if (!hero) findings.push('sketch:no-hero');
    if (!phone) findings.push('sketch:no-phone');
    if (!navigable) findings.push('sketch:no-nav');
    if (!onBrand) findings.push('sketch:off-brand');
    if (items.length > 18) findings.push('sketch:overbuilt');
    if (!notes) findings.push('sketch:no-notes');

    // 20 screen coverage (phone 10, two screens 10), 40 key components
    // (CTA 20, hero 20), navigation 20, notes 10, brand 10. Extra parts
    // never add completeness. Template quality spans 45–55: ±6 is a
    // comparable adjustment, not a replacement for its initial stats.
    const quality = (phone ? 10 : 0) + (frames.length >= 2 ? 10 : 0) +
      (cta ? 20 : 0) + (hero ? 20 : 0) + (navigable ? 20 : 0) + (notes ? 10 : 0) + (onBrand ? 10 : 0);
    const scopeDebt = Math.min(8, Math.ceil(Math.max(0, items.length - 18) / 3));
    return {
      findings, quality,
      statsDelta: { quality: Math.max(-6, Math.min(6, Math.round((quality - 50) * 0.12) - scopeDebt)),
        evidence: Math.min(6, notes * 2), scopeDebt },
      summary: [phone ? '包含移动端屏幕' : '未包含移动端屏幕',
        cta ? '首页包含购买入口' : '首页缺少购买入口', hero ? '首页包含主视觉' : '首页缺少主视觉',
        navigable ? '已连接页面导航' : '尚无页面导航', notes ? '部件包含行为备注' : '部件尚无行为备注',
        onBrand ? '主色符合品牌范围' : '主色偏离品牌范围', ...(scopeDebt ? ['部件数量超过范围'] : [])],
    };
  } catch {
    return { findings: ['sketch:unreadable'], quality: 0, statsDelta: {}, summary: ['原型数据无法读取'] };
  }
}
