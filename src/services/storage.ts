import type { GameContent, Run } from '../game/types';

export const STORAGE_KEYS = {
  run: 'guogao:run:v1',
  collection: 'guogao:collection:v1',
  settings: 'guogao:settings:v1',
} as const;

export type Backend = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LoadRunResult =
  | { status: 'none' }
  | { status: 'ok'; run: Run }
  | { status: 'corrupt' };

const PHASES = ['PREPARE', 'REVIEW', 'RESPOND', 'EVENT', 'BONUS', 'PARTY', 'ENDING'];

/** 结构 + 关键不变量校验（总纲：不要仅做 JSON.parse） */
export function validateRun(run: unknown, content: GameContent): string[] {
  const errors: string[] = [];
  const r = run as Partial<Run>;
  if (typeof run !== 'object' || run === null) return ['存档不是对象'];
  if (r.schemaVersion !== 1) errors.push('schemaVersion 不兼容');
  if (r.contentVersion !== content.contentVersion) errors.push('contentVersion 不一致');
  if (typeof r.runId !== 'string' || r.runId.length === 0) errors.push('runId 缺失');
  for (const key of ['seed', 'rngState'] as const) {
    const v = r[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 0xffffffff) {
      errors.push(`${key} 非法`);
    }
  }
  if (typeof r.seq !== 'number' || !Number.isInteger(r.seq) || r.seq < 0) errors.push('seq 非法');
  if (typeof r.phase !== 'string' || !PHASES.includes(r.phase)) errors.push('phase 非法');
  if (r.round !== 1 && r.round !== 2 && r.round !== 3) errors.push('round 非法');
  if (
    typeof r.submittedCount !== 'number' ||
    r.submittedCount < 0 ||
    r.submittedCount > content.config.maxSubmissions
  ) {
    errors.push('submittedCount 非法');
  }
  const s = r.stats;
  if (typeof s !== 'object' || s === null) {
    errors.push('stats 缺失');
  } else {
    for (const key of ['quality', 'trust', 'energy', 'evidence'] as const) {
      if (!Number.isInteger(s[key]) || s[key]! < 0 || s[key]! > 100) errors.push(`stats.${key} 越界`);
    }
    if (!Number.isInteger(s.scopeDebt) || s.scopeDebt < 0 || s.scopeDebt > 3) errors.push('stats.scopeDebt 越界');
  }
  if (!Array.isArray(r.reviews) || r.reviews.length !== r.submittedCount) {
    errors.push('reviews 数量与 submittedCount 不一致');
  }
  if (!Array.isArray(r.history) || !Array.isArray(r.seenEventIds)) errors.push('history/seenEventIds 缺失');
  if (Array.isArray(r.seenEventIds)) {
    const known = new Set(content.events.map((e) => e.id));
    for (const id of r.seenEventIds) {
      if (!known.has(id)) errors.push(`未知事件 ${id}`);
    }
    if (new Set(r.seenEventIds).size !== r.seenEventIds.length) errors.push('seenEventIds 重复');
  }
  const knownEvents = new Set(content.events.map((e) => e.id));
  if (r.phase === 'EVENT') {
    if (typeof r.pendingEventId !== 'string' || !knownEvents.has(r.pendingEventId)) {
      errors.push('EVENT 阶段缺少有效的 pendingEventId');
    }
  }
  if (r.phase === 'REVIEW' && !r.review) errors.push('REVIEW 阶段缺少评审快照');
  if (r.phase === 'PREPARE' && (r.review || r.pendingEventId)) errors.push('PREPARE 阶段不应残留评审或事件');
  if ((r.phase === 'BONUS' || r.phase === 'PARTY') && !r.bonus) errors.push('BONUS/PARTY 阶段缺少奖金状态');
  if (r.phase === 'PARTY' && r.bonus?.playerShare == null) errors.push('PARTY 阶段分成未确定');
  if ((r.phase === 'BONUS' || r.phase === 'PARTY') && r.reviews?.[r.reviews.length - 1]?.passed !== true) {
    errors.push('BONUS/PARTY 阶段最近评审应已通过');
  }
  if (r.phase === 'ENDING' && !r.endingId) errors.push('ENDING 阶段缺少结局 ID');
  if (r.phase !== 'ENDING' && r.endingId) errors.push('对局未结束却已有结局 ID');
  return errors;
}

export type StorageNotice = 'memory-fallback' | 'restored';

export class GameStorage {
  private backend: Backend;
  /** localStorage 不可用或写入失败后转内存模式 */
  persistent = true;
  onChangePersistent?: (persistent: boolean) => void;

  constructor(backend: Backend | null) {
    if (backend) {
      this.backend = backend;
    } else {
      const mem = new Map<string, string>();
      this.backend = {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => void mem.set(k, v),
        removeItem: (k) => void mem.delete(k),
      };
      this.persistent = false;
    }
  }

  static fromWindow(win: Pick<Window, 'localStorage'>): GameStorage {
    try {
      const probe = '__guogao_probe__';
      win.localStorage.setItem(probe, '1');
      win.localStorage.removeItem(probe);
      return new GameStorage(win.localStorage);
    } catch {
      return new GameStorage(null);
    }
  }

  private write(key: string, value: string): boolean {
    try {
      this.backend.setItem(key, value);
      return true;
    } catch {
      if (this.persistent) {
        this.persistent = false;
        this.onChangePersistent?.(false);
      }
      return false;
    }
  }

  saveRun(run: Run): boolean {
    return this.write(STORAGE_KEYS.run, JSON.stringify(run));
  }

  loadRun(content: GameContent): LoadRunResult {
    let raw: string | null;
    try {
      raw = this.backend.getItem(STORAGE_KEYS.run);
    } catch {
      return { status: 'none' };
    }
    if (!raw) return { status: 'none' };
    try {
      const parsed: unknown = JSON.parse(raw);
      const errors = validateRun(parsed, content);
      if (errors.length > 0) return { status: 'corrupt' };
      return { status: 'ok', run: parsed as Run };
    } catch {
      return { status: 'corrupt' };
    }
  }

  loadCollection(): string[] {
    try {
      const raw = this.backend.getItem(STORAGE_KEYS.collection);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { schemaVersion?: number; endingIds?: unknown };
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.endingIds)) return [];
      const known = new Set([
        'PASS_PROTECTED',
        'PASS_COMPROMISE',
        'BURNOUT',
        'FIRED',
        'LOOP',
        'QUIT',
      ]);
      return parsed.endingIds.filter((id): id is string => typeof id === 'string' && known.has(id));
    } catch {
      return [];
    }
  }

  saveCollection(ids: string[]): boolean {
    const unique = [...new Set(ids)];
    return this.write(STORAGE_KEYS.collection, JSON.stringify({ schemaVersion: 1, endingIds: unique }));
  }

  loadSettings(): { reduceMotion: boolean } {
    try {
      const raw = this.backend.getItem(STORAGE_KEYS.settings);
      if (!raw) return { reduceMotion: false };
      const parsed = JSON.parse(raw) as { reduceMotion?: unknown };
      return { reduceMotion: parsed.reduceMotion === true };
    } catch {
      return { reduceMotion: false };
    }
  }

  saveSettings(settings: { reduceMotion: boolean }): boolean {
    return this.write(STORAGE_KEYS.settings, JSON.stringify(settings));
  }

  clearRun(): void {
    try {
      this.backend.removeItem(STORAGE_KEYS.run);
    } catch {
      /* 忽略 */
    }
  }

  clearCollection(): void {
    try {
      this.backend.removeItem(STORAGE_KEYS.collection);
    } catch {
      /* 忽略 */
    }
  }
}

/** 读取存档页签的 runId / seq，用于多标签页冲突检测 */
export function peekRunStamp(raw: string | null): { runId: string; seq: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { runId?: unknown; seq?: unknown };
    if (typeof parsed.runId === 'string' && typeof parsed.seq === 'number') {
      return { runId: parsed.runId, seq: parsed.seq };
    }
    return null;
  } catch {
    return null;
  }
}
