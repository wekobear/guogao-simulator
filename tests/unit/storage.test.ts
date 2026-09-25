import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/schema';
import { applyAction, createRun, envelope } from '../../src/game/reducer';
import {
  GameStorage,
  peekRunStamp,
  STORAGE_KEYS,
  validateRun,
  type Backend,
} from '../../src/services/storage';
import type { ActionType, Run } from '../../src/game/types';

const content = loadContent();

/** business 模板 seed=1 的 PASS_PROTECTED 路径（与 golden fixture 第 1 条一致） */
const passPath: { type: ActionType; id?: string }[] = [
  { type: 'SUBMIT_PREP', id: 'improve' },
  { type: 'CONTINUE_REVIEW' },
  { type: 'CHOOSE_RESPONSE', id: 'ask' },
  { type: 'CHOOSE_EVENT_OPTION', id: 'confirm' },
  { type: 'SUBMIT_PREP', id: 'improve' },
  { type: 'CONTINUE_REVIEW' },
  { type: 'CHOOSE_BONUS', id: 'negotiate' },
  { type: 'CHOOSE_PARTY', id: 'self' },
];

/** replayTo(3)=EVENT，replayTo(6)=BONUS，replayTo(8)=ENDING */
function replayTo(step: number): Run {
  let run = createRun(1, 'business', content);
  for (let i = 0; i < step; i += 1) {
    const action = passPath[i]!;
    run = applyAction(run, envelope(run, action.type, action.id), content);
  }
  return run;
}

function mapBackend(): { backend: Backend; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    backend: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    },
  };
}

describe('T20 validateRun 结构不变量', () => {
  it('重放得到的 EVENT / BONUS / ENDING 存档均通过校验', () => {
    expect(replayTo(3).phase).toBe('EVENT');
    expect(replayTo(6).phase).toBe('BONUS');
    expect(replayTo(8).phase).toBe('ENDING');
    expect(validateRun(replayTo(3), content)).toEqual([]);
    expect(validateRun(replayTo(6), content)).toEqual([]);
    expect(validateRun(replayTo(8), content)).toEqual([]);
  });

  it('schemaVersion=9 返回非空错误列表', () => {
    const errors = validateRun({ schemaVersion: 9 }, content);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('schemaVersion 不兼容');
  });

  it('JSON 合法但 reviews 数与 submittedCount 不符', () => {
    const broken = { ...replayTo(8), submittedCount: 1 };
    const errors = validateRun(broken, content);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('reviews 数量与 submittedCount 不一致');
  });

  it('EVENT 阶段无 pendingEventId', () => {
    const eventRun = replayTo(3);
    const errors = validateRun({ ...eventRun, pendingEventId: null }, content);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('EVENT 阶段缺少有效的 pendingEventId');
  });

  it('BONUS 阶段无 bonus', () => {
    const bonusRun = replayTo(6);
    const errors = validateRun({ ...bonusRun, bonus: null }, content);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('BONUS/PARTY 阶段缺少奖金状态');
  });

  it('ENDING 阶段无 endingId', () => {
    const ended = replayTo(8);
    const errors = validateRun({ ...ended, endingId: null }, content);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('ENDING 阶段缺少结局 ID');
  });

  it('非对象输入直接判非法', () => {
    expect(validateRun(null, content)).toEqual(['存档不是对象']);
    expect(validateRun('json-string', content)).toEqual(['存档不是对象']);
  });

  it('seenEventIds 含未知 id / 重复时报错', () => {
    const eventRun = replayTo(3);
    const unknown = { ...eventRun, seenEventIds: ['E02', 'E99'] };
    expect(validateRun(unknown, content)).toContain('未知事件 E99');
    const dup = { ...eventRun, seenEventIds: ['E02', 'E02'] };
    expect(validateRun(dup, content)).toContain('seenEventIds 重复');
  });
});

describe('GameStorage', () => {
  it('STORAGE_KEYS 常量值', () => {
    expect(STORAGE_KEYS.run).toBe('guogao:run:v1');
    expect(STORAGE_KEYS.collection).toBe('guogao:collection:v1');
    expect(STORAGE_KEYS.settings).toBe('guogao:settings:v1');
  });

  it('T20 内存后端保存合法档 → loadRun status=ok 且内容一致', () => {
    const { backend } = mapBackend();
    const storage = new GameStorage(backend);
    expect(storage.persistent).toBe(true);
    expect(storage.loadRun(content).status).toBe('none');
    const run = replayTo(8);
    expect(storage.saveRun(run)).toBe(true);
    const result = storage.loadRun(content);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.run).toEqual(run);
    }
    storage.clearRun();
    expect(storage.loadRun(content).status).toBe('none');
  });

  it('T20 垃圾字符串 / JSON 合法但存档非法 → corrupt', () => {
    const { backend, data } = mapBackend();
    const storage = new GameStorage(backend);
    data.set(STORAGE_KEYS.run, '{{{not-json');
    expect(storage.loadRun(content).status).toBe('corrupt');
    data.set(STORAGE_KEYS.run, JSON.stringify({ schemaVersion: 9 }));
    expect(storage.loadRun(content).status).toBe('corrupt');
    data.set(STORAGE_KEYS.run, JSON.stringify([1, 2, 3]));
    expect(storage.loadRun(content).status).toBe('corrupt');
  });

  it('T19 saveCollection 两次相同 id → loadCollection 去重', () => {
    const { backend } = mapBackend();
    const storage = new GameStorage(backend);
    expect(storage.saveCollection(['FIRED'])).toBe(true);
    expect(storage.saveCollection(['FIRED'])).toBe(true);
    expect(storage.loadCollection()).toEqual(['FIRED']);
    expect(storage.saveCollection(['BURNOUT', 'FIRED', 'BURNOUT'])).toBe(true);
    expect(storage.loadCollection()).toEqual(['BURNOUT', 'FIRED']);
    storage.clearCollection();
    expect(storage.loadCollection()).toEqual([]);
  });

  it('loadCollection 过滤未知 id、坏数据与旧 schemaVersion', () => {
    const { backend, data } = mapBackend();
    const storage = new GameStorage(backend);
    data.set(STORAGE_KEYS.collection, JSON.stringify({ schemaVersion: 1, endingIds: ['FIRED', 'HACKED', 42] }));
    expect(storage.loadCollection()).toEqual(['FIRED']);
    data.set(STORAGE_KEYS.collection, 'garbage');
    expect(storage.loadCollection()).toEqual([]);
    data.set(STORAGE_KEYS.collection, JSON.stringify({ schemaVersion: 2, endingIds: ['FIRED'] }));
    expect(storage.loadCollection()).toEqual([]);
    expect(storage.loadCollection()).toEqual([]); // 无数据时同样为空
  });

  it('settings：默认关闭、可持久化、损坏回退默认', () => {
    const { backend, data } = mapBackend();
    const storage = new GameStorage(backend);
    expect(storage.loadSettings()).toEqual({ reduceMotion: false });
    expect(storage.saveSettings({ reduceMotion: true })).toBe(true);
    expect(storage.loadSettings()).toEqual({ reduceMotion: true });
    data.set(STORAGE_KEYS.settings, '###broken');
    expect(storage.loadSettings()).toEqual({ reduceMotion: false });
  });

  it('null 后端 → 内存模式，persistent=false 仍可读写', () => {
    const storage = new GameStorage(null);
    expect(storage.persistent).toBe(false);
    expect(storage.loadRun(content).status).toBe('none');
    expect(storage.saveRun(replayTo(8))).toBe(true);
    expect(storage.loadRun(content).status).toBe('ok');
  });

  it('T21 后端写入抛异常 → saveRun 返回 false、persistent 变 false、再次 saveRun 不抛', () => {
    const failing: Backend = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const storage = new GameStorage(failing);
    expect(storage.persistent).toBe(true);
    const run = replayTo(8);
    expect(storage.saveRun(run)).toBe(false);
    expect(storage.persistent).toBe(false);
    expect(() => storage.saveRun(run)).not.toThrow();
    expect(storage.saveRun(run)).toBe(false);
    expect(storage.saveCollection(['FIRED'])).toBe(false);
    expect(storage.saveSettings({ reduceMotion: true })).toBe(false);
    expect(storage.loadRun(content).status).toBe('none');
  });

  it('persistent 回调在首次写入失败时触发一次', () => {
    let calls = 0;
    const failing: Backend = {
      getItem: () => null,
      setItem: () => {
        throw new Error('nope');
      },
      removeItem: () => {},
    };
    const storage = new GameStorage(failing);
    storage.onChangePersistent = (persistent) => {
      calls += 1;
      expect(persistent).toBe(false);
    };
    storage.saveRun(replayTo(8));
    storage.saveRun(replayTo(8));
    expect(calls).toBe(1);
  });
});

describe('peekRunStamp', () => {
  it('null / 非法输入返回 null', () => {
    expect(peekRunStamp(null)).toBeNull();
    expect(peekRunStamp('not json')).toBeNull();
    expect(peekRunStamp(JSON.stringify({ runId: 1, seq: 'x' }))).toBeNull();
    expect(peekRunStamp(JSON.stringify({ hello: 1 }))).toBeNull();
  });

  it('合法存档字符串解出 runId/seq', () => {
    expect(peekRunStamp(JSON.stringify({ runId: 'run-a', seq: 3 }))).toEqual({ runId: 'run-a', seq: 3 });
    const run = replayTo(8);
    expect(peekRunStamp(JSON.stringify(run))).toEqual({ runId: run.runId, seq: run.seq });
  });
});
