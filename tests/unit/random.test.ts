import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/schema';
import { drawU, nextU32, pickEvent, weightedPick } from '../../src/game/random';

const content = loadContent();

describe('LCG：nextU32 / drawU', () => {
  it('nextU32(1) === 1015568748', () => {
    expect(nextU32(1)).toBe(1015568748);
  });

  it('链式推进符合 next = (imul(1664525, s) + 1013904223) >>> 0', () => {
    expect(nextU32(1015568748)).toBe(1586005467);
    expect(nextU32(1586005467)).toBe(2165703038);
    expect(nextU32(0)).toBe(1013904223);
    expect(nextU32(4294967295)).toBe((Math.imul(1664525, 4294967295) + 1013904223) >>> 0);
  });

  it('输出始终是 uint32', () => {
    for (const state of [0, 1, 2, 42, 123456789, 4294967295]) {
      const v = nextU32(state);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('drawU 返回 { u = next/2^32, next }，u 落在 [0,1)', () => {
    const { u, next } = drawU(1);
    expect(next).toBe(1015568748);
    expect(u).toBe(1015568748 / 4294967296);
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
    expect(drawU(1586005467).next).toBe(nextU32(1586005467));
  });
});

describe('weightedPick', () => {
  const items = [
    { id: 'a', weight: 3 },
    { id: 'b', weight: 3 },
    { id: 'c', weight: 2 },
  ];

  it('权重 [3,3,2] u=0.5 → 第二项；u=0 → 第一项', () => {
    expect(weightedPick(items, 0.5).id).toBe('b');
    expect(weightedPick(items, 0).id).toBe('a');
  });

  it('边界是严格小于：target=3 不落第一项', () => {
    // u*8 = 2.9992 → 第一项
    expect(weightedPick(items, 0.3749).id).toBe('a');
    // u*8 = 3.0 恰好等于累计权重 3 → 落第二项
    expect(weightedPick(items, 0.375).id).toBe('b');
  });

  it('接近 1 时取最后一项；target 超总权重时兜底返回最后一项', () => {
    expect(weightedPick(items, 0.999).id).toBe('c');
    expect(weightedPick(items, 1).id).toBe('c');
  });
});

describe('pickEvent', () => {
  it('空候选返回 null（不消耗随机）', () => {
    expect(pickEvent([], 1)).toBeNull();
  });

  it('从候选中按权重抽选并推进 rngState', () => {
    const picked = pickEvent(content.events, 1);
    expect(picked).not.toBeNull();
    // u = 1015568748 / 2^32 ≈ 0.2365，总权重 16，target ≈ 3.78 → E02（累计 3,6）
    expect(picked!.event.id).toBe('E02');
    expect(picked!.rngState).toBe(nextU32(1));
    expect(picked!.rngState).not.toBe(1);
  });

  it('同状态重放结果一致（确定性）', () => {
    const first = pickEvent(content.events, 42);
    const second = pickEvent(content.events, 42);
    expect(second!.event.id).toBe(first!.event.id);
    expect(second!.rngState).toBe(first!.rngState);
  });
});
