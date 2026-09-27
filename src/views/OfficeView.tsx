import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameContent, Run } from '../game/types';
import { OfficeStage, type StageState } from '../components/office/OfficeStage';
import { HOTSPOTS, PLAYER_MAX_X, PLAYER_MIN_X, type HotspotId } from '../components/office/sceneDraw';
import { AssemblyEditor } from '../components/AssemblyEditor';
import { SketchCanvas } from '../components/SketchCanvas';
import { assemblyToDoc, countDocNotes, defaultAssembly, type AssemblyState } from '../game/pageDoc';
import {
  beginCanvasSession,
  captureCanvasDraft,
  draftStorageHealthy,
  loadSketchDraft,
  resolveSubmissionDoc,
  saveAssemblyDraft,
} from '../services/sketchDraft';

type Props = {
  run: Run;
  content: GameContent;
  reduceMotion: boolean;
  onSubmitSketch: (doc: unknown) => void;
  onQuit: () => void;
};

type Scene = 'office' | 'editor' | 'canvas';

const MOVE_SPEED = 140; // 舞台像素/秒

/** 茶水间与打印机的叙事提示（只给气泡，不改任何数值） */
const SPOT_LINES: Record<'kettle' | 'printer', (content: GameContent) => string> = {
  kettle: () =>
    '饮水机咕嘟咕嘟……这是本周第 4 桶水。你在杯子上写了「别催」，字还没干。',
  printer: (content) =>
    `打印机吐出需求单：${content.config.brief.requirementLines.join('；')}。卡纸的那张是上一位设计师的辞职信。`,
};

/**
 * 认真模式第一轮：可交互 2.5D 办公室。
 * A/D 或方向键移动，点击地点走过去，E/空格交互：
 * 工位 → 拼装编辑器；经理室 → 交稿评审；茶水/打印 → 叙事与需求提示。
 */
export function OfficeView({ run, content, reduceMotion, onSubmitSketch, onQuit }: Props) {
  const lines = content.config.brief.requirementLines;
  const [scene, setScene] = useState<Scene>('office');
  const [assembly, setAssembly] = useState<AssemblyState>(() => defaultAssembly());
  const [draftKind, setDraftKind] = useState<'assembly' | 'canvas' | null>(null);
  const [storageWarning, setStorageWarning] = useState(!draftStorageHealthy());
  const [bubble, setBubble] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<HotspotId | null>(null);

  const stageRef = useRef<StageState>({
    playerX: 470,
    playerDir: 1,
    playerPose: 'idle',
    bossMood: 'idle',
    bossVisible: true,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const targetRef = useRef<{ x: number; interact: HotspotId | null } | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene>('office');
  sceneRef.current = scene;

  // 场景切换的视野管理：编辑器打开时滚到它（编辑器自己聚焦），
  // 关闭回到办公室时滚回舞台——用户视线始终跟着当前操作面。
  useEffect(() => {
    if (scene !== 'office') return;
    const el = stageWrapRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [scene, reduceMotion]);

  // 草稿恢复：按 runId 隔离，刷新/关闭重开不丢
  useEffect(() => {
    const draft = loadSketchDraft(run.runId);
    if (draft?.kind === 'assembly') {
      setAssembly(draft.state);
      setDraftKind('assembly');
    } else if (draft?.kind === 'canvas') {
      // 高级画布会话中断（如刷新）：从 m3e:doc 收养最新内容
      captureCanvasDraft(run.runId);
      setDraftKind('canvas');
    }
  }, [run.runId]);

  const showBubble = useCallback((text: string) => {
    setBubble(text);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 4200);
  }, []);
  useEffect(() => () => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
  }, []);

  const interact = useCallback(
    (id: HotspotId) => {
      if (id === 'desk') {
        setScene('editor');
        stageRef.current.playerPose = 'idle';
        return;
      }
      if (id === 'boss') {
        setConfirming(true);
        return;
      }
      showBubble(SPOT_LINES[id](content));
    },
    [content, showBubble],
  );

  // 键盘：移动 + 交互（输入聚焦时不劫持快捷键）
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (sceneRef.current !== 'office' || confirming) return;
      if (isTypingTarget(e.target)) return;
      const key = e.key;
      if (key === 'a' || key === 'A' || key === 'ArrowLeft') {
        keysRef.current.add('left');
        targetRef.current = null;
        e.preventDefault();
      } else if (key === 'd' || key === 'D' || key === 'ArrowRight') {
        keysRef.current.add('right');
        targetRef.current = null;
        e.preventDefault();
      } else if (key === 'e' || key === 'E' || key === ' ' || key === 'Spacebar') {
        const hotspot = HOTSPOTS.find(
          (h) => Math.abs(h.x - stageRef.current.playerX) <= h.range,
        );
        if (hotspot) {
          e.preventDefault();
          interact(hotspot.id);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === 'a' || key === 'A' || key === 'ArrowLeft') keysRef.current.delete('left');
      if (key === 'd' || key === 'D' || key === 'ArrowRight') keysRef.current.delete('right');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [interact, confirming]);

  // 移动循环：直接改 stageRef，OfficeStage 每帧读取
  useEffect(() => {
    if (scene !== 'office') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stageRef.current;
      const keys = keysRef.current;
      let dx = 0;
      if (keys.has('left')) dx -= 1;
      if (keys.has('right')) dx += 1;
      const target = targetRef.current;
      if (dx === 0 && target) {
        const diff = target.x - st.playerX;
        if (Math.abs(diff) <= MOVE_SPEED * dt + 1) {
          st.playerX = target.x;
          const want = target.interact;
          targetRef.current = null;
          if (want) interact(want);
        } else {
          dx = diff > 0 ? 1 : -1;
        }
      }
      if (dx !== 0) {
        st.playerX = Math.max(PLAYER_MIN_X, Math.min(PLAYER_MAX_X, st.playerX + dx * MOVE_SPEED * dt));
        st.playerDir = dx > 0 ? 1 : -1;
        st.playerPose = 'walk';
      } else if (st.playerPose === 'walk') {
        st.playerPose = 'idle';
      }
      const near = HOTSPOTS.find((h) => Math.abs(h.x - st.playerX) <= h.range) ?? null;
      setActiveHotspot((prev) => (prev === (near?.id ?? null) ? prev : near?.id ?? null));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, interact]);

  // 点击舞台：点到热点范围 → 走过去并交互；否则走到该处
  const onStageClick = useCallback((stageX: number) => {
    if (sceneRef.current !== 'office') return;
    const hotspot = HOTSPOTS.find((h) => Math.abs(h.x - stageX) <= h.range * 0.8);
    targetRef.current = { x: hotspot ? hotspot.x : stageX, interact: hotspot ? hotspot.id : null };
    keysRef.current.clear();
  }, []);

  const handleAssemblyChange = useCallback(
    (next: AssemblyState) => {
      setAssembly(next);
      const ok = saveAssemblyDraft(run.runId, next, lines.join(' '));
      setDraftKind('assembly');
      if (!ok) setStorageWarning(true);
    },
    [run.runId, lines],
  );

  const openCanvas = useCallback(() => {
    beginCanvasSession(run.runId, lines);
    setDraftKind('canvas');
    setScene('canvas');
  }, [run.runId, lines]);

  const closeCanvas = useCallback(() => {
    captureCanvasDraft(run.runId);
    setScene('office');
  }, [run.runId]);

  const discardCanvas = useCallback(() => {
    const fresh = defaultAssembly();
    setAssembly(fresh);
    saveAssemblyDraft(run.runId, fresh, lines.join(' '));
    setDraftKind('assembly');
  }, [run.runId, lines]);

  const submit = useCallback(() => {
    setConfirming(false);
    onSubmitSketch(resolveSubmissionDoc(run.runId, lines));
  }, [onSubmitSketch, run.runId, lines]);

  // 交稿确认信息：明确稿件状态，不提前泄分。备注计数读转换后的 Doc（备注块默认文案也算），
  // 与经理「行为备注」检查同源，避免「有备注块却提示暂无备注」的矛盾。
  const noteCount = useMemo(
    () => countDocNotes(assemblyToDoc(assembly, { brief: lines.join(' ') })),
    [assembly, lines],
  );
  const draftStatus = draftKind === 'canvas'
    ? '稿件在高级画布（M3E）里，交稿按画布当前内容检查。'
    : assembly.parts.length > 0
      ? `已拼 ${assembly.parts.length} 个部件${noteCount > 0 ? `，含行为备注 ${noteCount} 条` : '，暂无行为备注'}。`
      : '还没拼任何部件——空稿也允许交，但会收到缺项反馈。';

  const touchHold = (dir: 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      targetRef.current = null;
      keysRef.current.add(dir);
    },
    onPointerUp: () => keysRef.current.delete(dir),
    onPointerLeave: () => keysRef.current.delete(dir),
    onPointerCancel: () => keysRef.current.delete(dir),
  });

  return (
    <div className="office-view page wide">
      <div className="office-toprow">
        <h1 className="view-title">差不多创意部 · 办公室</h1>
        <span className="round-badge">
          认真模式 · 第 1 次提交
          <span className="round-dots" aria-hidden="true">
            <span className="round-dot" />
            <span className="round-dot" />
            <span className="round-dot" />
          </span>
          / 3
        </span>
      </div>

      <div ref={stageWrapRef} className={`office-stage-wrap${scene === 'editor' ? ' editor-open' : ''}`}>
        <OfficeStage
          mode="office"
          reduceMotion={reduceMotion}
          stateRef={stageRef}
          onStageClick={onStageClick}
          activeHotspot={activeHotspot}
        />
        <div className="office-hud" aria-live="polite">
          {activeHotspot === 'desk'
            ? '到工位了——按 E 拼装落地页'
            : activeHotspot === 'boss'
              ? '雕茅经理在玻璃房里看着你——按 E 交稿评审'
              : activeHotspot
                ? `走近${HOTSPOTS.find((h) => h.id === activeHotspot)?.label}——按 E 看看`
                : 'A/D 或 ←/→ 移动 · 点击地点走过去 · E 交互'}
        </div>
        {bubble ? (
          <div className="office-bubble" role="status">
            {bubble}
          </div>
        ) : null}
        <div className="office-touch" aria-hidden={false}>
          <button type="button" className="touch-btn" aria-label="向左移动" {...touchHold('left')}>
            ◀
          </button>
          <button
            type="button"
            className="touch-btn act"
            aria-label="交互"
            onClick={() => {
              const hotspot = HOTSPOTS.find((h) => Math.abs(h.x - stageRef.current.playerX) <= h.range);
              if (hotspot) interact(hotspot.id);
            }}
          >
            E
          </button>
          <button type="button" className="touch-btn" aria-label="向右移动" {...touchHold('right')}>
            ▶
          </button>
        </div>
      </div>

      <div className="office-stats" aria-label="本局指标速览">
        <span>稿件准备度 {run.stats.quality}</span>
        <span>老板信任 {run.stats.trust}</span>
        <span>剩余精力 {run.stats.energy}</span>
        <span>沟通凭证 {run.stats.evidence}</span>
        <span>额外承诺 {run.stats.scopeDebt}</span>
      </div>

      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setScene('editor')}>
          {draftKind === 'canvas' ? '打开拼装编辑器（当前稿件在画布）' : '回到工位编辑器'}
        </button>
        <button type="button" className="btn" onClick={() => setConfirming(true)}>
          去经理室交稿
        </button>
        <button type="button" className="btn btn-ghost" onClick={onQuit}>
          今天不干了（退出）
        </button>
      </div>
      {storageWarning ? (
        <div className="notice warn" role="status">
          当前浏览器无法保存草稿，本次编辑只在内存里，刷新会丢。
        </div>
      ) : null}

      {scene === 'editor' ? (
        <AssemblyEditor
          state={assembly}
          onChange={handleAssemblyChange}
          requirementLines={lines}
          fromCanvas={draftKind === 'canvas'}
          onOpenCanvas={openCanvas}
          onDiscardCanvas={discardCanvas}
          onClose={() => setScene('office')}
          storageWarning={storageWarning}
          reduceMotion={reduceMotion}
        />
      ) : null}

      {scene === 'canvas' ? <SketchCanvas content={content} onClose={closeCanvas} /> : null}

      {confirming ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="交稿确认">
          <div className="modal office-confirm">
            <div className="modal-head">
              <h2 className="modal-title">把这一稿交给雕茅经理？</h2>
            </div>
            <div className="modal-body">
              <p>{draftStatus}</p>
              <p className="brief-note">需求会逐条对：主视觉、立即购买、手机竖屏、页面导航、品牌色、行为备注。</p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-primary" onClick={submit}>
                交稿，让他看
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                再改改
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
