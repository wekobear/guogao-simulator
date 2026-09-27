import { describe, expect, it } from 'vitest';
import {
  PART_ORDER,
  assemblyToDoc,
  countDocNotes,
  defaultAssembly,
  parseAssemblyState,
  type AssemblyPart,
  type AssemblyState,
} from '../../src/game/pageDoc';
import { analyzeSketch } from '../../src/game/prototype';

const FULL_PARTS: AssemblyPart[] = [
  { id: 'a', kind: 'nav', variant: 'bar' },
  { id: 'b', kind: 'hero', variant: 'mud_splash' },
  { id: 'c', kind: 'cta', variant: 'hardcore' },
  { id: 'd', kind: 'note', variant: 'req' },
];

const fullState: AssemblyState = { parts: FULL_PARTS, brandColor: '#FF5722', navLinked: true };

describe('assemblyToDoc · 真实 Doc 结构', () => {
  it('空状态生成双帧无部件 → analyzeSketch 判空稿（允许交，得既有缺项反馈）', () => {
    const doc = assemblyToDoc(defaultAssembly());
    expect(doc.frames).toHaveLength(2);
    expect(doc.groups).toHaveLength(0);
    const result = analyzeSketch(doc);
    expect(result.findings).toContain('sketch:empty');
    expect(result.quality).toBe(0);
  });

  it('完整拼装（导航+主视觉+CTA+备注）通过全部关键检查', () => {
    const result = analyzeSketch(assemblyToDoc(fullState));
    expect(result.findings).not.toContain('sketch:no-cta');
    expect(result.findings).not.toContain('sketch:no-hero');
    expect(result.findings).not.toContain('sketch:no-phone');
    expect(result.findings).not.toContain('sketch:no-nav');
    expect(result.findings).not.toContain('sketch:no-notes');
    expect(result.findings).not.toContain('sketch:off-brand');
    expect(result.quality).toBeGreaterThanOrEqual(90);
  });

  it('部件顺序反映在几何坐标：桌面与手机组的 y 均按顺序递增', () => {
    const state: AssemblyState = {
      parts: [
        { id: 'p1', kind: 'hero', variant: 'studio_side' },
        { id: 'p2', kind: 'cta', variant: 'hardcore' },
        { id: 'p3', kind: 'footer', variant: 'plain' },
      ],
      brandColor: '#FF5722',
      navLinked: true,
    };
    const doc = assemblyToDoc(state);
    // 每个部件生成桌面 + 手机两组
    expect(doc.groups).toHaveLength(6);
    // 桌面组、手机组各自的 y 均按顺序递增（空间顺序即编排顺序）
    const desktopYs = doc.groups.filter((g) => g.id.endsWith('-d')).map((g) => g.y);
    const mobileYs = doc.groups.filter((g) => g.id.endsWith('-m')).map((g) => g.y);
    expect(desktopYs).toEqual([...desktopYs].sort((a, b) => a - b));
    expect(mobileYs).toEqual([...mobileYs].sort((a, b) => a - b));
    expect(new Set(desktopYs).size).toBe(desktopYs.length);
    // 顺序对应：hero 组 y=0，cta 组 y>0，footer 更大
    const heroY = doc.groups.find((g) => g.id === 'asm-g-p1-d')!.y;
    const ctaY = doc.groups.find((g) => g.id === 'asm-g-p2-d')!.y;
    const footY = doc.groups.find((g) => g.id === 'asm-g-p3-d')!.y;
    expect(heroY).toBeLessThan(ctaY);
    expect(ctaY).toBeLessThan(footY);
  });

  it('导航选「全屏沉浸」→ 缺页面导航反馈（变体影响真实检查）', () => {
    const state: AssemblyState = {
      parts: [
        { id: 'n', kind: 'nav', variant: 'none' },
        { id: 'h', kind: 'hero', variant: 'mud_splash' },
        { id: 'c', kind: 'cta', variant: 'hardcore' },
      ],
      brandColor: '#FF5722',
      navLinked: true,
    };
    expect(analyzeSketch(assemblyToDoc(state)).findings).toContain('sketch:no-nav');
  });

  it('关闭导航连接 → 缺页面导航', () => {
    const state: AssemblyState = { ...fullState, navLinked: false };
    expect(analyzeSketch(assemblyToDoc(state)).findings).toContain('sketch:no-nav');
  });

  it('品牌色跑偏（藏青）→ off-brand 反馈；品牌橙通过', () => {
    const off: AssemblyState = { ...fullState, brandColor: '#1A237E' };
    expect(analyzeSketch(assemblyToDoc(off)).findings).toContain('sketch:off-brand');
    expect(analyzeSketch(assemblyToDoc(fullState)).findings).not.toContain('sketch:off-brand');
  });

  it('只放主视觉不放 CTA → 缺立即购买反馈', () => {
    const state: AssemblyState = {
      parts: [{ id: 'h', kind: 'hero', variant: 'mud_splash' }],
      brandColor: '#FF5722',
      navLinked: true,
    };
    const result = analyzeSketch(assemblyToDoc(state));
    expect(result.findings).toContain('sketch:no-cta');
  });

  it('部件超建（19 个）→ overbuilt 反馈', () => {
    const parts: AssemblyPart[] = [];
    for (let i = 0; i < 19; i += 1) {
      parts.push({ id: `x${i}`, kind: PART_ORDER[i % PART_ORDER.length]!, variant: 'plain' });
    }
    // footer/note/bullets 等没有 'plain' 变体的也能转换（回落第一个变体）
    const state: AssemblyState = { parts, brandColor: '#FF5722', navLinked: true };
    const doc = assemblyToDoc(state);
    const result = analyzeSketch(doc);
    expect(result.findings).toContain('sketch:overbuilt');
  });

  it('部件多到超出默认帧高时帧自动增高，CTA 中心仍落在桌面帧内', () => {
    const parts: AssemblyPart[] = [
      { id: 'h1', kind: 'hero', variant: 'mud_splash' },
      { id: 's1', kind: 'specs', variant: 'table' },
      { id: 's2', kind: 'specs', variant: 'table' },
      { id: 'c', kind: 'cta', variant: 'hardcore' },
    ];
    const doc = assemblyToDoc({ parts, brandColor: '#FF5722', navLinked: true });
    const home = doc.frames[0]!;
    const ctaGroup = doc.groups.find((g) => g.id === 'asm-g-c-d')!;
    const centerY = ctaGroup.y + 72 / 2;
    expect(centerY).toBeLessThanOrEqual(home.h);
    // analyze 仍能识别 CTA 在首页
    expect(analyzeSketch(doc).findings).not.toContain('sketch:no-cta');
  });
});

describe('parseAssemblyState · 防御解析', () => {
  it('合法状态往返：save 形状 → parse 还原（品牌色规范化为小写）', () => {
    const state = { ...fullState };
    const parsed = parseAssemblyState(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual({ ...state, brandColor: '#ff5722' });
  });

  it('损坏输入返回 null：非对象 / parts 非数组 / kind 未知 / 颜色非法回落品牌橙', () => {
    expect(parseAssemblyState(null)).toBeNull();
    expect(parseAssemblyState('x')).toBeNull();
    expect(parseAssemblyState({ parts: 'nope' })).toBeNull();
    expect(parseAssemblyState({ parts: [{ kind: 'hack', variant: 'x' }] })).toBeNull();
    const badColor = parseAssemblyState({ parts: [], brandColor: 'not-a-color' });
    expect(badColor?.brandColor).toBe('#FF5722');
  });

  it('navLinked 默认 true，显式 false 保留', () => {
    expect(parseAssemblyState({ parts: [] })?.navLinked).toBe(true);
    expect(parseAssemblyState({ parts: [], navLinked: false })?.navLinked).toBe(false);
  });
});

describe('countDocNotes · 交稿确认备注计数与检查同源', () => {
  it('备注块默认文案计入（part.note 为空也有 note 进入 Doc）', () => {
    const doc = assemblyToDoc(fullState);
    expect(countDocNotes(doc)).toBeGreaterThanOrEqual(1);
    // 与 analyzeSketch 的「行为备注」检查同源：计数 > 0 时该 finding 不出现
    expect(analyzeSketch(doc).findings).not.toContain('sketch:no-notes');
  });

  it('无备注部件与手填备注都正确计数（双帧去重后按部件计）', () => {
    const withManual: AssemblyState = {
      parts: [
        { id: 'n1', kind: 'nav', variant: 'bar', note: '  ' }, // 空白备注不算
        { id: 'h1', kind: 'hero', variant: 'studio_side', note: '点击滚动到参数区' },
        { id: 't1', kind: 'note', variant: 'risk' }, // 默认文案算
      ],
      brandColor: '#FF5722',
      navLinked: true,
    };
    expect(countDocNotes(assemblyToDoc(withManual))).toBe(2);
    const bare = assemblyToDoc({
      parts: [{ id: 'x', kind: 'hero', variant: 'studio_side' }],
      brandColor: '#FF5722',
      navLinked: true,
    });
    expect(countDocNotes(bare)).toBe(0);
  });
});
