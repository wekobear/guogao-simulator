/**
 * 原型草稿：按 runId 隔离，修复「每次打开画布 seed 覆盖稿件」的问题。
 *
 * 数据流（认真模式第一轮）：
 * - 轻量拼装编辑器每次变更 → 存 assembly 草稿，并把转换后的 Doc 同步写 m3e:doc
 *   （高级画布 iframe 打开时读同一个 key，两边看到同一份稿）
 * - 打开高级画布前 → 把草稿 Doc 写入 m3e:doc，标记草稿 kind=canvas，并登记画布 owner=runId
 * - 收起画布 / 交稿 / 场景重挂载 → owner 是本局时才从 m3e:doc 回读（画布自己边改边存）
 *   owner 判定以后端登记为准（其他标签页可能刚接管画布），后端不可用时才用内存兜底
 * - 存储失败 → 内存镜像继续，读取时内存优先于 localStorage（写失败不回退旧值）
 */

import { assemblyToDoc, cloneAssembly, parseAssemblyState, type AssemblyState } from '../game/pageDoc';
import { CANVAS_DOC_KEY, buildSeedDoc } from './canvas';

const DRAFT_PREFIX = 'guogao:sketch-draft:v1:';
/** m3e:doc 当前归属的局：跨局/多标签防串稿 */
const CANVAS_OWNER_KEY = 'guogao:canvas-owner:v1';

export type SketchDraft =
  | { kind: 'assembly'; state: AssemblyState }
  | { kind: 'canvas'; doc: unknown };

type Backend = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * 存储后端：默认浏览器 localStorage，测试可注入；不可用时走内存兜底。
 * 某些隐私设置下访问 localStorage getter 本身就抛 SecurityError（typeof 也会触发），
 * 必须包 try/catch，否则模块加载即崩、整个游戏无法启动。
 */
let backend: Backend | null = (() => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
})();

/** 测试注入（tests/unit/sketchDraft.test.ts） */
export function setSketchDraftBackendForTests(b: Backend | null): void {
  backend = b;
  memoryDrafts.clear();
  memoryOwner = null;
}

/**
 * 内存镜像：每次写入（无论后端成败）都同步更新，读取时优先于后端。
 * 这样「后端已有旧值 + 本次写入配额失败」不会让下一次读取回退到旧稿。
 */
const memoryDrafts = new Map<string, string>();
let persistent = true;

function writeRaw(runId: string, value: string): boolean {
  memoryDrafts.set(runId, value);
  if (backend) {
    try {
      backend.setItem(DRAFT_PREFIX + runId, value);
      persistent = true;
      return true;
    } catch {
      persistent = false;
      return false;
    }
  }
  persistent = false;
  return false;
}

function readRaw(runId: string): string | null {
  const mem = memoryDrafts.get(runId);
  if (mem !== undefined) return mem;
  if (backend) {
    try {
      const raw = backend.getItem(DRAFT_PREFIX + runId);
      if (raw !== null) return raw;
    } catch {
      /* fallthrough 到内存 */
    }
  }
  return null;
}

function writeCanvasDoc(doc: unknown): boolean {
  if (!backend) return false;
  try {
    backend.setItem(CANVAS_DOC_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

function readCanvasDoc(): unknown {
  if (!backend) return null;
  try {
    const raw = backend.getItem(CANVAS_DOC_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** 画布 owner 的内存兜底：仅在后端不可用/读取失败时生效 */
let memoryOwner: string | null = null;

/**
 * 画布 owner 以后端登记为准：其他标签页可能刚把画布接管过去，内存值已过期。
 * 后端可读就返回实际值（包括别人的 runId）；只有后端不可用/读取失败才用内存。
 * 自己写 owner 失败时后端仍留着他人登记，读出来不是本局——不会误拥有别人的 doc。
 */
function readCanvasOwner(): string | null {
  if (backend) {
    try {
      return backend.getItem(CANVAS_OWNER_KEY);
    } catch {
      /* fallthrough 到内存 */
    }
  }
  return memoryOwner;
}

function writeCanvasOwner(runId: string): void {
  memoryOwner = runId;
  if (!backend) return;
  try {
    backend.setItem(CANVAS_OWNER_KEY, runId);
  } catch {
    /* owner 登记失败不阻塞画布会话 */
  }
}

/** m3e:doc 里的内容是否属于本局（供测试与调试） */
export function canvasDocOwnedBy(runId: string): boolean {
  return readCanvasOwner() === runId;
}

export function draftStorageHealthy(): boolean {
  return persistent;
}

/** 保存拼装编辑器草稿；同步写 m3e:doc（并登记 owner）保持高级画布一致。写入失败返回 false（内存继续） */
export function saveAssemblyDraft(runId: string, state: AssemblyState, brief?: string): boolean {
  const doc = assemblyToDoc(state, { brief });
  const payload = JSON.stringify({ kind: 'assembly', state: cloneAssembly(state) });
  const ok = writeRaw(runId, payload);
  const canvasOk = writeCanvasDoc(doc);
  if (canvasOk) writeCanvasOwner(runId);
  return canvasOk && ok;
}

/**
 * 标记当前局改用高级画布：先把最新 Doc 写入 m3e:doc（画布启动读取的 key）。
 * 本局没有任何草稿时，只有 m3e:doc 的 owner 就是本局才收养其内容，
 * 否则视为别的局（或多标签）留下的稿，重新 seed——不把旧局画布当新局草稿。
 */
export function beginCanvasSession(runId: string, requirementLines: string[]): boolean {
  const draft = loadSketchDraft(runId);
  let doc: unknown;
  if (draft?.kind === 'assembly') {
    doc = assemblyToDoc(draft.state, { brief: requirementLines.join(' ') });
  } else if (draft?.kind === 'canvas') {
    doc = draft.doc;
  } else if (readCanvasOwner() === runId) {
    doc = readCanvasDoc();
  } else {
    doc = null;
  }
  if (doc && typeof doc === 'object') {
    writeCanvasDoc(doc);
  } else {
    // 无收养资格（别的局的画布稿）：直接构造新 seed，不回读 m3e:doc，
    // 避免 seed 写入失败时把别人的稿捡回来。
    doc = buildSeedDoc(requirementLines);
    writeCanvasDoc(doc);
  }
  writeCanvasOwner(runId);
  return writeRaw(runId, JSON.stringify({ kind: 'canvas', doc }));
}

/**
 * 从 m3e:doc 回读画布当前文档（收起画布 / 交稿 / 场景重挂载时调用）。
 * owner 已被别的局占用时不回读，保留本局原草稿（不把别人的稿收进来）。
 */
export function captureCanvasDraft(runId: string): boolean {
  if (readCanvasOwner() !== runId) return false;
  return writeRaw(runId, JSON.stringify({ kind: 'canvas', doc: readCanvasDoc() }));
}

/** 读取本局草稿；无草稿或结构损坏返回 null */
export function loadSketchDraft(runId: string): SketchDraft | null {
  const raw = readRaw(runId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown; state?: unknown; doc?: unknown };
    if (parsed.kind === 'assembly') {
      const state = parseAssemblyState(parsed.state);
      return state ? { kind: 'assembly', state } : null;
    }
    if (parsed.kind === 'canvas') {
      return { kind: 'canvas', doc: parsed.doc ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 交稿用的最终 Doc：assembly → 转换；canvas → owner 是本局时读 m3e:doc 实时内容；
 * 无草稿 → 空双帧（空稿允许交，得到既有缺项反馈）。
 */
export function resolveSubmissionDoc(runId: string, requirementLines: string[]): unknown {
  const empty = assemblyToDoc({ parts: [], brandColor: '#FF5722', navLinked: true }, { brief: requirementLines.join(' ') });
  const draft = loadSketchDraft(runId);
  if (draft?.kind === 'assembly') {
    return assemblyToDoc(draft.state, { brief: requirementLines.join(' ') });
  }
  if (draft?.kind === 'canvas') {
    const live = canvasDocOwnedBy(runId) ? readCanvasDoc() : null;
    if (live && typeof live === 'object') return live;
    return draft.doc && typeof draft.doc === 'object' ? draft.doc : empty;
  }
  return empty;
}

/** 局结束/重开时清理本局草稿（交稿快照已冻结进 Run.sketch，不受影响） */
export function clearSketchDraft(runId: string): void {
  if (backend) {
    try {
      backend.removeItem(DRAFT_PREFIX + runId);
    } catch {
      /* 忽略 */
    }
  }
  memoryDrafts.delete(runId);
}
