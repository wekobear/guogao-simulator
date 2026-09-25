import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/schema';
import {
  applyDelta,
  buildReviewText,
  clamp,
  clampStats,
  computeScore,
  gradeOf,
  isPassed,
  makeReview,
  passReasons,
  roundHalfUp,
} from '../../src/game/scoring';
import type { Grade, Stats } from '../../src/game/types';

const content = loadContent();
const config = content.config;

function mkStats(partial: Partial<Stats> = {}): Stats {
  return { quality: 0, trust: 0, energy: 0, evidence: 0, scopeDebt: 0, ...partial };
}

describe('roundHalfUp / clamp / clampStats', () => {
  it('roundHalfUp = floor(x+0.5)', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(-0.5)).toBe(0);
    expect(roundHalfUp(-1.5)).toBe(-1);
    expect(roundHalfUp(3)).toBe(3);
  });

  it('clamp 夹在 [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(7, 10, 20)).toBe(10);
  });

  it('clampStats：四舍五入 + 越界截断（scopeDebt 上限 3）', () => {
    expect(clampStats(mkStats({ quality: 55.6, trust: 55.4 }))).toEqual(
      mkStats({ quality: 56, trust: 55 }),
    );
    expect(clampStats(mkStats({ quality: 120, energy: -5, scopeDebt: 4 }))).toEqual(
      mkStats({ quality: 100, energy: 0, scopeDebt: 3 }),
    );
    expect(clampStats(mkStats({ scopeDebt: 0.5 }))).toEqual(mkStats({ scopeDebt: 1 }));
  });

  it('applyDelta：省略字段视为 0，全部同时应用后再截断', () => {
    const base = mkStats({ quality: 95, trust: 10, energy: 5, evidence: 30, scopeDebt: 1 });
    expect(applyDelta(base, {})).toEqual(base);
    expect(applyDelta(base, { quality: 10, scopeDebt: 2 })).toEqual(
      mkStats({ quality: 100, trust: 10, energy: 5, evidence: 30, scopeDebt: 3 }),
    );
    // 能量同时 +25 与 -12：先求和再截断，而不是分步截断
    expect(applyDelta(mkStats({ energy: 90 }), { energy: 25 })).toEqual(mkStats({ energy: 100 }));
    expect(applyDelta(base, { energy: -100 })).toEqual(mkStats({ quality: 95, trust: 10, evidence: 30, scopeDebt: 1, energy: 0 }));
  });
});

describe('computeScore', () => {
  it('score = floor(0.60*quality + 0.25*trust + 0.15*evidence - 5*scopeDebt + 0.5)', () => {
    expect(computeScore(mkStats({ quality: 65, trust: 50, evidence: 30 }), config)).toBe(56);
    expect(computeScore(mkStats({ quality: 100, trust: 40, evidence: 20 }), config)).toBe(73);
    expect(computeScore(mkStats({ quality: 75, trust: 75, evidence: 5 }), config)).toBe(65);
  });

  it('scopeDebt 每点扣 5 分', () => {
    expect(computeScore(mkStats({ quality: 100, trust: 100, evidence: 100, scopeDebt: 3 }), config)).toBe(85);
    expect(computeScore(mkStats({ quality: 100, trust: 100, evidence: 100, scopeDebt: 0 }), config)).toBe(100);
  });

  it('结果夹在 0-100', () => {
    expect(computeScore(mkStats({ quality: 0, trust: 0, evidence: 0, scopeDebt: 3 }), config)).toBe(0);
    expect(computeScore(mkStats({ quality: 100, trust: 100, evidence: 100 }), config)).toBe(100);
  });
});

describe('T02 等级边界', () => {
  const cases: [number, Grade][] = [
    [34, 'D'],
    [35, 'C'],
    [49, 'C'],
    [50, 'B'],
    [64, 'B'],
    [65, 'A'],
    [79, 'A'],
    [80, 'S'],
    [0, 'D'],
    [100, 'S'],
  ];
  it.each(cases)('gradeOf(%i) === %s', (score, grade) => {
    expect(gradeOf(score, config)).toBe(grade);
  });
});

describe('过稿条件与退回原因', () => {
  it('三个条件都不满足时按固定顺序输出', () => {
    const stats = mkStats({ scopeDebt: 3 });
    const score = computeScore(stats, config);
    expect(score).toBe(0);
    expect(passReasons(stats, score, config)).toEqual(['score', 'trust', 'evidenceOrTrust']);
    expect(isPassed(stats, score, config)).toBe(false);
  });

  it('T03 quality=100 trust=39 evidence=100 → 分数够但信任不足', () => {
    const stats = mkStats({ quality: 100, trust: 39, evidence: 100 });
    const score = computeScore(stats, config);
    expect(score).toBe(85);
    expect(isPassed(stats, score, config)).toBe(false);
    expect(passReasons(stats, score, config)).toContain('trust');
    expect(passReasons(stats, score, config)).toEqual(['trust']);
  });

  it('T04 quality=100 trust=40 evidence=20 → 73 分 A 级通过', () => {
    const stats = mkStats({ quality: 100, trust: 40, evidence: 20 });
    const score = computeScore(stats, config);
    expect(score).toBe(73);
    expect(gradeOf(score, config)).toBe('A');
    expect(isPassed(stats, score, config)).toBe(true);
    expect(passReasons(stats, score, config)).toEqual([]);
  });

  it('T05 trust=75 evidence=5 且分数>=65 → 靠替代条件通过', () => {
    const stats = mkStats({ quality: 75, trust: 75, evidence: 5 });
    const score = computeScore(stats, config);
    expect(score).toBe(65);
    expect(isPassed(stats, score, config)).toBe(true);
    // 反例：同样 65 分但 trust 74、evidence 不足 20 → 不通过
    const near = mkStats({ quality: 76, trust: 74, evidence: 5 });
    expect(computeScore(near, config)).toBe(65);
    expect(isPassed(near, computeScore(near, config), config)).toBe(false);
    expect(passReasons(near, computeScore(near, config), config)).toEqual(['evidenceOrTrust']);
  });
});

describe('评审生成', () => {
  it('makeReview 冻结快照：字段完整、statsSnapshot 为拷贝', () => {
    const stats = mkStats({ quality: 100, trust: 40, evidence: 20 });
    const review = makeReview(1, stats, config, content.reviews);
    expect(review.round).toBe(1);
    expect(review.score).toBe(73);
    expect(review.grade).toBe('A');
    expect(review.passed).toBe(true);
    expect(review.reasonIds).toEqual([]);
    expect(review.statsSnapshot).toEqual(stats);
    expect(review.statsSnapshot).not.toBe(stats);
    expect(review.text).toBe(`${content.reviews.prefix}${content.reviews.lines.A.passed}`);
  });

  it('S 级评审文本以「感觉很奇怪。」开头且含「自己再想想吧。」', () => {
    const stats = mkStats({ quality: 90, trust: 80, evidence: 80 });
    const score = computeScore(stats, config);
    expect(score).toBe(86);
    expect(gradeOf(score, config)).toBe('S');
    const review = makeReview(3, stats, config, content.reviews);
    expect(review.text.startsWith('感觉很奇怪。')).toBe(true);
    expect(review.text).toContain('自己再想想吧。');
  });

  it('buildReviewText：S 级追加固定台词，非 S 级不追加', () => {
    const sFail = buildReviewText('S', false, content.reviews);
    expect(sFail).toBe(`${content.reviews.prefix}${content.reviews.sGradeLine}${content.reviews.lines.S.fail}`);
    const bPass = buildReviewText('B', true, content.reviews);
    expect(bPass).toBe(`${content.reviews.prefix}${content.reviews.lines.B.passed}`);
    expect(bPass).not.toContain('自己再想想吧');
  });
});
