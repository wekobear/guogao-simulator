import type { GameContent, LogEntry, Run, Stats, StatsDelta } from './types';
import { applyDelta } from './scoring';

export const STAT_KEYS = ['quality', 'trust', 'energy', 'evidence', 'scopeDebt'] as const;

export const STAT_LABELS: Record<keyof Stats, string> = {
  quality: '稿件准备度',
  trust: '老板信任',
  energy: '剩余精力',
  evidence: '沟通凭证',
  scopeDebt: '额外承诺',
};

/** 预览：截断后的实际变化（用于「精力 95 休息后 +5」这类展示） */
export function previewChange(
  stats: Stats,
  deltas: StatsDelta,
): { after: Stats; changes: { key: keyof Stats; from: number; to: number; delta: number }[] } {
  const after = applyDelta(stats, deltas);
  const changes = STAT_KEYS.filter((key) => (deltas[key] ?? 0) !== 0).map((key) => ({
    key,
    from: stats[key],
    to: after[key],
    delta: after[key] - stats[key],
  }));
  return { after, changes };
}

export function formatChanges(changes: { key: keyof Stats; delta: number }[]): string {
  return changes.map((c) => `${STAT_LABELS[c.key]} ${c.delta > 0 ? '+' : ''}${c.delta}`).join('，');
}

export function willExhaustEnergy(stats: Stats, deltas: StatsDelta): boolean {
  return applyDelta(stats, deltas).energy <= 0;
}

export function currentEvent(run: Run, content: GameContent) {
  if (run.phase !== 'EVENT' || !run.pendingEventId) return null;
  return content.events.find((e) => e.id === run.pendingEventId) ?? null;
}

export function negotiateCheck(run: Run, content: GameContent): { ok: boolean; missing: string[] } {
  const req = content.config.negotiate.requires;
  const missing: string[] = [];
  if (run.stats.evidence < req.evidence) missing.push(`沟通凭证不足 ${req.evidence}`);
  if (run.stats.trust < req.trust) missing.push(`老板信任不足 ${req.trust}`);
  return { ok: missing.length === 0, missing };
}

/** 结局卡「关键选择」：已结算的准备/回应/事件/奖金/庆功里最近三条，按时间顺序 */
export function keyChoices(history: LogEntry[]): LogEntry[] {
  const kinds = new Set(['preparation', 'response', 'event', 'bonus', 'party']);
  return history.filter((h) => kinds.has(h.kind)).slice(-3);
}

export function gradeOrDash(run: Run): string {
  return run.reviews.length > 0 ? run.reviews[run.reviews.length - 1]!.grade : '—';
}

export function shareCopy(run: Run, content: GameContent): string {
  const ending = content.endings.find((e) => e.id === run.endingId);
  const title = ending?.title ?? '未知结局';
  const grade = gradeOrDash(run);
  const cash = run.bonus?.cash ?? 0;
  const body = ending?.body ?? '';
  return [
    `我在《过稿模拟器》解锁了「${title}」`,
    `提交 ${run.submittedCount} 次｜最近等级 ${grade}｜游戏内奖金 ${cash} 元`,
    body,
  ].join('\n');
}

/** 最近一条日志（用于跨视图保留的 resultText 横幅） */
export function lastSettledEntry(run: Run): LogEntry | null {
  return run.history.length > 0 ? run.history[run.history.length - 1]! : null;
}

/** 最近一次准备动作 id（内置稿件视觉微调用） */
export function lastPreparationId(run: Run): string | null {
  for (let i = run.history.length - 1; i >= 0; i -= 1) {
    const entry = run.history[i]!;
    if (entry.kind === 'preparation') return entry.itemId;
  }
  return null;
}
