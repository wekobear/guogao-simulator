/**
 * 唯一的确定性随机发生器（总纲规定）：
 *   next = (Math.imul(1664525, rngState) + 1013904223) >>> 0
 *   u = next / 4294967296
 * 每次实际抽奖仅推进一次 rngState。
 */

export type DrawResult = {
  /** [0, 1) 均匀随机数 */
  u: number;
  /** 新的 rngState */
  next: number;
};

export function nextU32(state: number): number {
  return (Math.imul(1664525, state) + 1013904223) >>> 0;
}

export function drawU(state: number): DrawResult {
  const value = nextU32(state);
  return { u: value / 4294967296, next: value };
}

/** 加权抽选：target = u * sum(weights)，取第一个 target < 累计权重的条目 */
export function weightedPick<T extends { weight: number }>(items: T[], u: number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const target = u * total;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (target < cumulative) return item;
  }
  return items[items.length - 1]!;
}

/** 从候选（未看过）事件里消耗一次随机并抽选 */
export function pickEvent<T extends { weight: number; id: string }>(
  candidates: T[],
  rngState: number,
): { event: T; rngState: number } | null {
  if (candidates.length === 0) return null;
  const { u, next } = drawU(rngState);
  return { event: weightedPick(candidates, u), rngState: next };
}
