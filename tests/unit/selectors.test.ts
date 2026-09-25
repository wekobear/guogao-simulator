import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/schema';
import { createRun } from '../../src/game/reducer';
import { makeReview } from '../../src/game/scoring';
import {
  gradeOrDash,
  keyChoices,
  negotiateCheck,
  previewChange,
  shareCopy,
  willExhaustEnergy,
} from '../../src/game/selectors';
import type { LogEntry, Run, Stats } from '../../src/game/types';

const content = loadContent();
const config = content.config;

function mkStats(partial: Partial<Stats> = {}): Stats {
  return { quality: 0, trust: 0, energy: 0, evidence: 0, scopeDebt: 0, ...partial };
}

describe('T07 previewChange：截断后的实际变化', () => {
  it('energy 95 + 25（rest）→ 实际 +5', () => {
    const base = mkStats({ quality: 50, trust: 50, energy: 95, evidence: 30 });
    const result = previewChange(base, { energy: 25 });
    expect(result.after.energy).toBe(100);
    expect(result.changes).toEqual([{ key: 'energy', from: 95, to: 100, delta: 5 }]);
    // 原 stats 不被修改
    expect(base.energy).toBe(95);
  });

  it('scopeDebt 2 + 1 → 3（顶格）', () => {
    const result = previewChange(mkStats({ scopeDebt: 2 }), { scopeDebt: 1 });
    expect(result.after.scopeDebt).toBe(3);
    expect(result.changes).toEqual([{ key: 'scopeDebt', from: 2, to: 3, delta: 1 }]);
  });

  it('quality 100 + 15 → 实际变化 0，但仍出现在 changes 里', () => {
    const result = previewChange(mkStats({ quality: 100 }), { quality: 15 });
    expect(result.after.quality).toBe(100);
    expect(result.changes).toEqual([{ key: 'quality', from: 100, to: 100, delta: 0 }]);
  });

  it('输入里为 0 的字段不出现在 changes；多字段按固定顺序输出', () => {
    const base = mkStats({ quality: 50, trust: 50, energy: 40, evidence: 30, scopeDebt: 0 });
    const result = previewChange(base, { quality: 10, trust: 0, energy: -15 });
    expect(result.changes.map((c) => c.key)).toEqual(['quality', 'energy']);
    expect(result.after).toEqual(mkStats({ quality: 60, trust: 50, energy: 25, evidence: 30, scopeDebt: 0 }));
  });
});

describe('willExhaustEnergy', () => {
  it('结算后 energy <= 0 判真', () => {
    expect(willExhaustEnergy(mkStats({ energy: 10 }), { energy: -12 })).toBe(true);
    expect(willExhaustEnergy(mkStats({ energy: 12 }), { energy: -12 })).toBe(true);
    expect(willExhaustEnergy(mkStats({ energy: 20 }), { energy: -12 })).toBe(false);
    expect(willExhaustEnergy(mkStats({ energy: 95 }), { energy: 25 })).toBe(false);
  });
});

describe('negotiateCheck', () => {
  function bonusRunWith(evidence: number, trust: number): Run {
    const base = createRun(1, 'business', content);
    return {
      ...base,
      phase: 'BONUS',
      stats: { ...base.stats, evidence, trust },
      bonus: { initialBossShare: 75, playerShare: null, redPacket: 0, cash: 0 },
    };
  }

  it('凭证/信任任一不足时给出缺失项', () => {
    expect(negotiateCheck(bonusRunWith(39, 40), content)).toEqual({ ok: false, missing: ['沟通凭证不足 40'] });
    expect(negotiateCheck(bonusRunWith(40, 39), content)).toEqual({ ok: false, missing: ['老板信任不足 40'] });
    expect(negotiateCheck(bonusRunWith(39, 39), content)).toEqual({
      ok: false,
      missing: ['沟通凭证不足 40', '老板信任不足 40'],
    });
  });

  it('双达标时 ok 且无缺失项', () => {
    expect(negotiateCheck(bonusRunWith(40, 40), content)).toEqual({ ok: true, missing: [] });
    expect(negotiateCheck(bonusRunWith(60, 50), content).ok).toBe(true);
  });
});

describe('keyChoices', () => {
  it('过滤 quit，只保留已结算动作里最近三条且保持时间顺序', () => {
    function entry(seq: number, kind: LogEntry['kind']): LogEntry {
      const s = mkStats({ quality: 50, trust: 50, energy: 50, evidence: 50 });
      return { seq, kind, round: 1, itemId: `item-${seq}`, before: s, after: s, resultText: 'x' };
    }
    const history: LogEntry[] = [
      entry(1, 'quit'),
      entry(2, 'preparation'),
      entry(3, 'response'),
      entry(4, 'event'),
      entry(5, 'bonus'),
      entry(6, 'party'),
    ];
    expect(keyChoices(history).map((e) => e.seq)).toEqual([4, 5, 6]);
    expect(keyChoices([entry(1, 'preparation')]).map((e) => e.seq)).toEqual([1]);
    expect(keyChoices([])).toEqual([]);
  });
});

describe('gradeOrDash / shareCopy', () => {
  const statsA = mkStats({ quality: 100, trust: 40, evidence: 20 });
  const reviewA = makeReview(1, statsA, config, content.reviews); // 73 A
  const statsB = mkStats({ quality: 65, trust: 50, evidence: 30 });
  const reviewB = makeReview(2, statsB, config, content.reviews); // 56 B

  it('gradeOrDash 取最近一次评审等级，无评审为 —', () => {
    const base = createRun(1, 'business', content);
    expect(gradeOrDash(base)).toBe('—');
    const run: Run = { ...base, reviews: [reviewB, reviewA] };
    expect(gradeOrDash(run)).toBe('A');
  });

  it('shareCopy 拼接结局标题 / 提交次数 / 等级 / 奖金', () => {
    const base = createRun(1, 'business', content);
    const ended: Run = {
      ...base,
      phase: 'ENDING',
      endingId: 'PASS_PROTECTED',
      submittedCount: 2,
      reviews: [reviewA],
      bonus: { initialBossShare: 70, playerShare: 75, redPacket: 20, cash: 770 },
    };
    const copy = shareCopy(ended, content);
    expect(copy).toContain('过稿·硬气版');
    expect(copy).toContain('提交 2 次');
    expect(copy).toContain('最近等级 A');
    expect(copy).toContain('游戏内奖金 770 元');
    expect(copy.split('\n')).toHaveLength(3);
  });

  it('无结局/无评审时回退为 未知结局 / — / 0 元', () => {
    const fresh = createRun(1, 'business', content);
    const copy = shareCopy(fresh, content);
    expect(copy).toContain('未知结局');
    expect(copy).toContain('最近等级 —');
    expect(copy).toContain('游戏内奖金 0 元');
  });
});
