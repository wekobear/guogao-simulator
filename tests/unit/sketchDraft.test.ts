import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginCanvasSession,
  captureCanvasDraft,
  clearSketchDraft,
  draftStorageHealthy,
  loadSketchDraft,
  resolveSubmissionDoc,
  saveAssemblyDraft,
  setSketchDraftBackendForTests,
} from '../../src/services/sketchDraft';
import { CANVAS_DOC_KEY } from '../../src/services/canvas';
import { defaultAssembly, parseAssemblyState, type AssemblyPart } from '../../src/game/pageDoc';

/** 简单内存 backend：可注入故障 */
function makeBackend() {
  const store = new Map<string, string>();
  return {
    store,
    fail: false,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem(k: string, v: string) {
      if (this.fail) throw new Error('quota');
      store.set(k, v);
    },
    removeItem(k: string) {
      store.delete(k);
    },
  };
}

const PARTS: AssemblyPart[] = [
  { id: 'p1', kind: 'hero', variant: 'mud_splash' },
  { id: 'p2', kind: 'cta', variant: 'hardcore' },
];

let backend: ReturnType<typeof makeBackend>;

beforeEach(() => {
  backend = makeBackend();
  setSketchDraftBackendForTests(backend);
});

afterEach(() => {
  setSketchDraftBackendForTests(null);
});

describe('拼装草稿 · 保存与恢复', () => {
  it('保存后能按 runId 读回同一状态（刷新/重开不丢）', () => {
    const state = { parts: PARTS, brandColor: '#FF5722', navLinked: true };
    expect(saveAssemblyDraft('run-1', state, '需求 A')).toBe(true);
    const draft = loadSketchDraft('run-1');
    expect(draft?.kind).toBe('assembly');
    if (draft?.kind === 'assembly') {
      expect(draft.state.parts).toHaveLength(2);
      expect(draft.state.parts[0]?.kind).toBe('hero');
    }
  });

  it('不同 runId 的草稿互不干扰（跨局隔离）', () => {
    const a = { parts: [PARTS[0]!], brandColor: '#FF5722', navLinked: true };
    const b = { parts: PARTS, brandColor: '#F7B733', navLinked: false };
    saveAssemblyDraft('run-A', a, 'A');
    saveAssemblyDraft('run-B', b, 'B');
    const da = loadSketchDraft('run-A');
    const db = loadSketchDraft('run-B');
    expect(da?.kind).toBe('assembly');
    expect(db?.kind).toBe('assembly');
    if (da?.kind === 'assembly' && db?.kind === 'assembly') {
      expect(da.state.parts).toHaveLength(1);
      expect(db.state.parts).toHaveLength(2);
      expect(db.state.brandColor).toBe('#F7B733'.toLowerCase());
      expect(db.state.navLinked).toBe(false);
    }
  });

  it('保存拼装草稿时同步写 m3e:doc（高级画布读到同一份稿）', () => {
    saveAssemblyDraft('run-1', { parts: PARTS, brandColor: '#FF5722', navLinked: true }, '需求 A');
    const raw = backend.store.get(CANVAS_DOC_KEY);
    expect(raw).toBeTruthy();
    const doc = JSON.parse(raw!) as { brief: string; groups: unknown[] };
    expect(doc.brief).toBe('需求 A');
    expect(doc.groups.length).toBe(4);
  });

  it('清除草稿后读取为 null，不影响其他局', () => {
    saveAssemblyDraft('run-1', { parts: PARTS, brandColor: '#FF5722', navLinked: true });
    saveAssemblyDraft('run-2', { parts: [], brandColor: '#FF5722', navLinked: true });
    clearSketchDraft('run-1');
    expect(loadSketchDraft('run-1')).toBeNull();
    expect(loadSketchDraft('run-2')).not.toBeNull();
  });
});

describe('高级画布会话 · 与拼装编辑器同步', () => {
  it('从拼装进入画布：m3e:doc 已就位，草稿标记为 canvas 且携带转换结果', () => {
    saveAssemblyDraft('run-1', { parts: PARTS, brandColor: '#FF5722', navLinked: true }, '需求 A');
    expect(beginCanvasSession('run-1', ['需求 A'])).toBe(true);
    const draft = loadSketchDraft('run-1');
    expect(draft?.kind).toBe('canvas');
    if (draft?.kind === 'canvas') {
      const doc = draft.doc as { groups: unknown[] };
      expect(doc.groups).toHaveLength(4);
    }
  });

  it('画布内继续编辑 → captureCanvasDraft 回读最新内容（刷新后收养孤儿编辑）', () => {
    beginCanvasSession('run-1', ['需求 A']);
    // 模拟画布 iframe 边改边存
    const edited = { title: '画布里的新稿', frames: [], groups: [{ id: 'g', x: 0, y: 0, axis: 'y', items: [] }] };
    backend.store.set(CANVAS_DOC_KEY, JSON.stringify(edited));
    expect(captureCanvasDraft('run-1')).toBe(true);
    expect(resolveSubmissionDoc('run-1', ['需求 A'])).toEqual(edited);
  });

  it('直接重开页面（未 capture）：canvas 草稿仍在，resolveSubmissionDoc 优先实时 m3e:doc', () => {
    beginCanvasSession('run-1', ['需求 A']);
    const draftDoc = (loadSketchDraft('run-1') as { doc: unknown }).doc;
    // 画布又改了一版但页面崩了没来得及 capture
    const newer = { title: '更晚的一版', frames: [], groups: [] };
    backend.store.set(CANVAS_DOC_KEY, JSON.stringify(newer));
    expect(resolveSubmissionDoc('run-1', ['需求 A'])).toEqual(newer);
    expect(draftDoc).not.toEqual(newer);
  });
});

describe('交稿解析 · 空稿与缺省', () => {
  it('无草稿 → 空双帧 Doc（空稿允许交，得到既有缺项反馈而非崩溃）', () => {
    const doc = resolveSubmissionDoc('run-fresh', ['需求']) as {
      frames: { id: string; w: number }[];
      groups: unknown[];
    };
    expect(doc.frames.map((f) => f.id)).toEqual(['sketch-home', 'sketch-phone']);
    expect(doc.groups).toHaveLength(0);
  });

  it('assembly 草稿 → 交稿用转换后的 Doc（含 brief）', () => {
    saveAssemblyDraft('run-1', { parts: PARTS, brandColor: '#FF5722', navLinked: true }, '需求 B');
    const doc = resolveSubmissionDoc('run-1', ['需求 B']) as { brief: string; groups: unknown[] };
    expect(doc.brief).toBe('需求 B');
    expect(doc.groups).toHaveLength(4);
  });

  it('canvas 会话起手拿干净 seed；m3e:doc 被清空时回落本局快照而非空稿', () => {
    beginCanvasSession('run-1', ['需求']);
    backend.store.delete(CANVAS_DOC_KEY);
    const doc = resolveSubmissionDoc('run-1', ['需求']) as { frames: unknown[]; groups: unknown[] };
    expect(doc.frames).toHaveLength(2);
    expect(doc.groups).toHaveLength(2);
  });
});

describe('存储故障 · 内存兜底', () => {
  it('写入抛错 → 返回 false，游戏在内存里继续', () => {
    backend.fail = true;
    const ok = saveAssemblyDraft('run-1', { parts: PARTS, brandColor: '#FF5722', navLinked: true });
    expect(ok).toBe(false);
    expect(draftStorageHealthy()).toBe(false);
    backend.fail = false;
    // 内存兜底仍能读回
    const draft = loadSketchDraft('run-1');
    expect(draft?.kind).toBe('assembly');
    if (draft?.kind === 'assembly') {
      expect(parseAssemblyState(draft.state)?.parts).toHaveLength(2);
    }
  });

  it('后端已有旧值 + 本次写入失败 → 读取拿到最新内存稿，不回退旧 localStorage', () => {
    // 第一次成功写入：backend 与内存都有 v1
    saveAssemblyDraft('run-1', { parts: [PARTS[0]!], brandColor: '#FF5722', navLinked: true });
    // 配额失败：backend 留着 v1，内存更新为 v2
    backend.fail = true;
    saveAssemblyDraft('run-1', { parts: PARTS, brandColor: '#F7B733', navLinked: true });
    backend.fail = false;
    const draft = loadSketchDraft('run-1');
    expect(draft?.kind).toBe('assembly');
    if (draft?.kind === 'assembly') {
      expect(draft.state.parts).toHaveLength(2);
      expect(draft.state.brandColor).toBe('#f7b733');
    }
    // 交稿也必须用最新版
    const doc = resolveSubmissionDoc('run-1', ['需求']) as { groups: unknown[] };
    expect(doc.groups).toHaveLength(4);
  });

  it('后端不可用（null）→ 内存兜底可读写', () => {
    setSketchDraftBackendForTests(null);
    expect(saveAssemblyDraft('run-x', defaultAssembly())).toBe(false);
    expect(loadSketchDraft('run-x')?.kind).toBe('assembly');
  });

  it('草稿被外部写坏 → loadSketchDraft 返回 null（UI 回落默认）', () => {
    backend.store.set('guogao:sketch-draft:v1:run-1', '{oops');
    expect(loadSketchDraft('run-1')).toBeNull();
    backend.store.set('guogao:sketch-draft:v1:run-1', JSON.stringify({ kind: 'mystery' }));
    expect(loadSketchDraft('run-1')).toBeNull();
  });
});

describe('高级画布 owner · 跨局防串稿', () => {
  it('别的局留下的 m3e:doc 不会被无草稿的新局收养', () => {
    // run-1 开画布并让画布存了一版
    beginCanvasSession('run-1', ['需求']);
    const foreign = { title: 'run-1 的稿', frames: [], groups: [] };
    backend.store.set(CANVAS_DOC_KEY, JSON.stringify(foreign));
    // run-2 无草稿开画布：owner 是 run-1，不能把 foreign 当 run-2 草稿
    beginCanvasSession('run-2', ['需求']);
    const draft2 = loadSketchDraft('run-2');
    expect(draft2?.kind).toBe('canvas');
    if (draft2?.kind === 'canvas') {
      expect(draft2.doc).not.toEqual(foreign);
    }
  });

  it('owner 被别的局占用时：capture 不回读、交稿用本局快照而非他人画布', () => {
    saveAssemblyDraft('run-1', { parts: PARTS, brandColor: '#FF5722', navLinked: true }, '需求');
    beginCanvasSession('run-1', ['需求']);
    const ownDoc = (loadSketchDraft('run-1') as { doc: unknown }).doc;
    // 另一个局接管了画布
    beginCanvasSession('run-2', ['需求']);
    const foreign = { title: 'run-2 的稿', frames: [], groups: [] };
    backend.store.set(CANVAS_DOC_KEY, JSON.stringify(foreign));
    // run-1 收起画布：不把 foreign 收进来
    expect(captureCanvasDraft('run-1')).toBe(false);
    // run-1 交稿：用自己的 canvas 快照（转换稿），不是 foreign
    const doc = resolveSubmissionDoc('run-1', ['需求']) as { title?: string };
    expect(doc).not.toEqual(foreign);
    expect(doc).toEqual(ownDoc);
  });

  it('另一标签页直接改写 backend 的 owner 与 m3e:doc：本局不捕获、不提交他稿', () => {
    beginCanvasSession('run-1', ['需求']);
    const ownDoc = (loadSketchDraft('run-1') as { doc: unknown }).doc;
    // 另一标签页绕过本模块直接接管画布——backend 可读，内存 owner（仍是 run-1）已过期
    backend.store.set('guogao:canvas-owner:v1', 'run-other-tab');
    const foreign = { title: '别的标签页的稿', frames: [], groups: [] };
    backend.store.set(CANVAS_DOC_KEY, JSON.stringify(foreign));
    expect(captureCanvasDraft('run-1')).toBe(false);
    const doc = resolveSubmissionDoc('run-1', ['需求']);
    expect(doc).not.toEqual(foreign);
    expect(doc).toEqual(ownDoc);
  });

  it('写 owner 失败（后端仍是他人登记）不会误判自己拥有别人的 doc', () => {
    // 另一标签页先接管画布
    backend.store.set('guogao:canvas-owner:v1', 'run-other');
    const foreign = { title: '别人的稿', frames: [], groups: [] };
    backend.store.set(CANVAS_DOC_KEY, JSON.stringify(foreign));
    // 本局开画布，但 owner 登记写入失败（配额）：内存 owner=run-1，后端还是 run-other
    backend.fail = true;
    beginCanvasSession('run-1', ['需求']);
    backend.fail = false;
    expect(captureCanvasDraft('run-1')).toBe(false);
    expect(resolveSubmissionDoc('run-1', ['需求'])).not.toEqual(foreign);
  });
});
