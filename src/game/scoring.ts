import type { GameConfig, Grade, ReasonId, Review, Stats } from './types';

/** 本项目取整方式：floor(x + 0.5)，与正数 Math.round 一致 */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampStats(stats: Stats): Stats {
  return {
    quality: clamp(Math.round(stats.quality), 0, 100),
    trust: clamp(Math.round(stats.trust), 0, 100),
    energy: clamp(Math.round(stats.energy), 0, 100),
    evidence: clamp(Math.round(stats.evidence), 0, 100),
    scopeDebt: clamp(Math.round(stats.scopeDebt), 0, 3),
  };
}

export function applyDelta(stats: Stats, delta: Partial<Stats>): Stats {
  return clampStats({
    quality: stats.quality + (delta.quality ?? 0),
    trust: stats.trust + (delta.trust ?? 0),
    energy: stats.energy + (delta.energy ?? 0),
    evidence: stats.evidence + (delta.evidence ?? 0),
    scopeDebt: stats.scopeDebt + (delta.scopeDebt ?? 0),
  });
}

/**
 * score = clamp(floor(0.60×quality + 0.25×trust + 0.15×evidence
 *                   − 5×scopeDebt + 0.5), 0, 100)
 */
export function computeScore(stats: Stats, config: GameConfig): number {
  const w = config.scoreWeights;
  const raw =
    w.quality * stats.quality +
    w.trust * stats.trust +
    w.evidence * stats.evidence -
    w.scopeDebtPenalty * stats.scopeDebt +
    0.5;
  return clamp(Math.floor(raw), 0, 100);
}

export function gradeOf(score: number, config: GameConfig): Grade {
  for (const bound of config.gradeBounds) {
    if (score >= bound.min) return bound.grade;
  }
  return 'D';
}

/**
 * passed = score >= 65 AND trust >= 40 AND (evidence >= 20 OR trust >= 75)
 * 退回原因按「分数不足、信任不足、凭证或信任条件不足」顺序列出，可同时出现。
 */
export function passReasons(stats: Stats, score: number, config: GameConfig): ReasonId[] {
  const { minScore, minTrust, minEvidence, altTrust } = config.pass;
  const reasons: ReasonId[] = [];
  if (score < minScore) reasons.push('score');
  if (stats.trust < minTrust) reasons.push('trust');
  if (!(stats.evidence >= minEvidence || stats.trust >= altTrust)) {
    reasons.push('evidenceOrTrust');
  }
  return reasons;
}

export function isPassed(stats: Stats, score: number, config: GameConfig): boolean {
  return passReasons(stats, score, config).length === 0;
}

export const REASON_TEXT: Record<ReasonId, string> = {
  score: '过稿指数不足 65',
  trust: '老板信任不足 40',
  evidenceOrTrust: '沟通凭证不足 20，且信任未到 75',
};

/** 按固定口头禅 + S 级台词 + 等级脚本拼接老板台词 */
export function buildReviewText(
  grade: Grade,
  passed: boolean,
  reviews: { prefix: string; sGradeLine: string; lines: Record<Grade, { passed: string; fail: string }> },
): string {
  const parts: string[] = [reviews.prefix];
  if (grade === 'S') parts.push(reviews.sGradeLine);
  parts.push(reviews.lines[grade][passed ? 'passed' : 'fail']);
  return parts.join('');
}

export function makeReview(
  round: number,
  stats: Stats,
  config: GameConfig,
  reviews: GameContentReviews,
): Review {
  const score = computeScore(stats, config);
  const grade = gradeOf(score, config);
  const reasonIds = passReasons(stats, score, config);
  return {
    round,
    score,
    grade,
    passed: reasonIds.length === 0,
    reasonIds,
    statsSnapshot: { ...stats },
    text: buildReviewText(grade, reasonIds.length === 0, reviews),
  };
}

type GameContentReviews = {
  prefix: string;
  sGradeLine: string;
  lines: Record<Grade, { passed: string; fail: string }>;
};
