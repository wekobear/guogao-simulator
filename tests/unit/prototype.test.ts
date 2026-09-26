import { describe, expect, it } from 'vitest';
import { analyzeSketch, BRAND_PRIMARY } from '../../src/game/prototype';

function good() {
  return {
    frames: [{ id: 'desktop', x: 0, y: 0, w: 1280, h: 800 },
      { id: 'phone', x: 1500, y: 0, w: 412, h: 892 }],
    groups: [{ x: 20, y: 20, axis: 'y', items: [
      { id: 'hero', kind: 'image', label: '石影 X1', size: 200, note: '保留产品图片' },
      { id: 'cta', kind: 'button', label: '立即购买', note: '前往购买页', action: { to: 'phone', transition: 'slide' } },
    ] }], paletteKey: 'custom', customPalette: { primary: BRAND_PRIMARY },
  };
}

describe('analyzeSketch', () => {
  it.each([null, undefined, 42, 'bad', [], { frames: 'bad' }, { frames: [null] },
    { groups: [{ items: [null] }] }, { groups: [{ items: [{ kind: 'invented' }] }] },
    { frames: [{ id: 'bad', w: NaN }] }, { groups: [{ x: Infinity }] },
    { groups: [{ items: [{ kind: 'button', action: { target: 'phone' } }] }] },
  ])('rejects malformed data: %j', value => {
    expect(analyzeSketch(value)).toEqual({ findings: ['sketch:unreadable'], quality: 0,
      statsDelta: {}, summary: ['原型数据无法读取'] });
  });

  it('contains throwing getters and revoked proxies', () => {
    const value = { get frames() { throw new Error('bad getter'); } };
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const input of [value, revoked.proxy]) expect(analyzeSketch(input).findings).toEqual(['sketch:unreadable']);
  });

  it.each([{}, { frames: [], groups: [] }, { frames: [{ id: 'phone' }], groups: [] },
    { groups: [{ items: [{ kind: 'button' }] }] },
  ])('recognizes an empty document without rewards', doc => {
    const result = analyzeSketch(doc);
    expect(result.findings).toContain('sketch:empty');
    expect(result.quality).toBe(0);
    expect(result.statsDelta.quality ?? 0).toBeLessThanOrEqual(0);
    expect(result.statsDelta.evidence ?? 0).toBe(0);
  });

  it('rewards a complete prototype and leaves input unchanged', () => {
    const doc = good();
    const before = structuredClone(doc);
    const result = analyzeSketch(doc);
    expect(result.findings).toEqual([]);
    expect(result.quality).toBe(100);
    expect(result.statsDelta).toEqual({ quality: 6, evidence: 4, scopeDebt: 0 });
    expect(doc).toEqual(before);
    expect(analyzeSketch(doc)).toEqual(result);
  });

  it('uses 1000 as desktop boundary and missing width as phone', () => {
    const doc = good();
    doc.frames[1].w = 1000;
    expect(analyzeSketch(doc).findings).toContain('sketch:no-phone');
    doc.frames[1].w = 999;
    expect(analyzeSketch(doc).findings).not.toContain('sketch:no-phone');
    const legacy = { ...doc, frames: [{ id: 'phone', x: 0, y: 0 }] };
    expect(analyzeSketch(legacy).findings).not.toContain('sketch:no-phone');
    expect(analyzeSketch(legacy).findings).not.toContain('sketch:no-cta');
  });

  it.each(['button', 'extendedFab', 'fab', 'splitButton', 'iconButton'])('recognizes purchasing %s', kind => {
    const doc = good();
    doc.groups[0].items[1].kind = kind;
    doc.groups[0].items[1].label = 'RESERVE now';
    expect(analyzeSketch(doc).findings).not.toContain('sketch:no-cta');
  });

  it('requires a purchasing label on a tappable component', () => {
    const doc = good();
    doc.groups[0].items[1].label = '了解更多';
    expect(analyzeSketch(doc).findings).toContain('sketch:no-cta');
    doc.groups[0].items[1].label = '购买';
    doc.groups[0].items[1].kind = 'divider';
    expect(analyzeSketch(doc).findings).toContain('sketch:no-cta');
  });

  it('does not count another screen or off-canvas content as the homepage', () => {
    const doc = good();
    doc.groups[0].x = 1520;
    expect(analyzeSketch(doc).findings).toEqual(expect.arrayContaining(['sketch:no-cta', 'sketch:no-hero']));
    doc.groups[0].x = -2000;
    expect(analyzeSketch(doc).findings).toContain('sketch:no-hero');
  });

  it('uses group bounds centre, including free offsets, rather than its origin', () => {
    const doc = good();
    doc.groups[0].x = -80;
    expect(analyzeSketch(doc).findings).not.toContain('sketch:no-hero');
    const free = { ...doc, groups: [{ ...doc.groups[0], free: true,
      pos: { hero: { x: 4000, y: 0 }, cta: { x: 4000, y: 250 } } }] };
    expect(analyzeSketch(free).findings).toContain('sketch:no-hero');
  });

  it('selects first desktop even when phone is listed first', () => {
    const doc = good();
    doc.frames.reverse();
    expect(analyzeSketch(doc).findings).toEqual([]);
  });

  it('recognizes camera placeholders', () => {
    const doc = good();
    doc.groups[0].items[0].kind = 'camera';
    expect(analyzeSketch(doc).findings).not.toContain('sketch:no-hero');
  });

  it('requires existing navigation destinations and supports per-slot actions', () => {
    const doc = good();
    doc.groups[0].items[1].action!.to = 'missing';
    expect(analyzeSketch(doc).findings).toContain('sketch:no-nav');
    const slots = { ...doc, groups: [{ ...doc.groups[0], items: [{ kind: 'bottomNav', label: '',
      actions: { 'tab:0': { to: 'phone', transition: 'fade' } } }] }] };
    expect(analyzeSketch(slots).findings).not.toContain('sketch:no-nav');
  });

  it.each(['#0000ff', 'invalid', '#ffffff'])('flags off-brand primary %s', primary => {
    const doc = good();
    doc.customPalette.primary = primary;
    expect(analyzeSketch(doc).findings).toContain('sketch:off-brand');
  });

  it('rejects presets even with a retained custom palette', () => {
    const doc = good();
    doc.paletteKey = 'mono';
    expect(analyzeSketch(doc).findings).toContain('sketch:off-brand');
    expect(analyzeSketch({ ...doc, customPalette: undefined }).findings).toContain('sketch:off-brand');
  });

  it('includes distance 120, excludes 121, accepts lowercase hex', () => {
    const doc = good();
    doc.customPalette.primary = '#875722';
    expect(analyzeSketch(doc).findings).not.toContain('sketch:off-brand');
    doc.customPalette.primary = '#865722';
    expect(analyzeSketch(doc).findings).toContain('sketch:off-brand');
    doc.customPalette.primary = '#ff5722';
    expect(analyzeSketch(doc).findings).not.toContain('sketch:off-brand');
  });

  it('ignores whitespace-only notes', () => {
    const doc = good();
    doc.groups[0].items.forEach(item => { item.note = ' \n '; });
    expect(analyzeSketch(doc).findings).toContain('sketch:no-notes');
    expect(analyzeSketch(doc).statsDelta.evidence).toBe(0);
  });

  it.each([18, 19, 100])('bounds scope and rewards at %i components', count => {
    const doc = good();
    const extra = Array.from({ length: count - 2 }, () => ({ kind: 'divider', label: '' }));
    const result = analyzeSketch({ ...doc, groups: [...doc.groups, { x: 1550, y: 20, items: extra }] });
    expect(result.findings.includes('sketch:overbuilt')).toBe(count > 18);
    expect(result.statsDelta.scopeDebt).toBe(count === 18 ? 0 : count === 19 ? 1 : 8);
    expect(result.quality).toBeGreaterThanOrEqual(0);
    expect(result.quality).toBeLessThanOrEqual(100);
    expect(result.statsDelta.quality).toBeGreaterThanOrEqual(-6);
    expect(result.statsDelta.quality).toBeLessThanOrEqual(6);
    expect(result.statsDelta.evidence).toBeGreaterThanOrEqual(0);
    expect(result.statsDelta.evidence).toBeLessThanOrEqual(6);
    expect(Object.keys(result.statsDelta).sort()).toEqual(['evidence', 'quality', 'scopeDebt']);
    expect(result.summary.every(line => [...line].length <= 18)).toBe(true);
  });

  it('gives a poor prototype no positive reward', () => {
    const result = analyzeSketch({ frames: [{ id: 'desktop', w: 1280 }],
      groups: [{ items: [{ kind: 'divider', label: '' }] }] });
    expect(result.statsDelta.quality).toBe(-6);
    expect(result.statsDelta.evidence).toBe(0);
  });
});
