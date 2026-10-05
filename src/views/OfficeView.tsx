import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameContent, Run } from '../game/types';
import { OfficeStage, type StageState } from '../components/office/OfficeStage';
import {
  computeHotspots,
  computeWorld,
  useOfficeArt,
  type HotspotId,
} from '../components/office/artAssets';
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

/**
 * 认真模式第一轮：全屏可交互像素办公室（v0.3.0 真实美术资产）。
 * A/D 或方向键移动，点击场景/徽标走过去，E/空格交互：
 * 工位 → 拼装编辑器（场景内面板）；经理室 → 交稿评审；茶水/打印 → 叙事与需求提示。
 * 移动端：左下方向键 + 右下 ≥48px 交互键，任务与最近热点提示常驻，需求可展开。
 */
export function OfficeView({ run, content, reduceMotion, onSubmitSketch, onQuit }: Props) {
  const lines = content.config.brief.requirementLines;
  const art = useOfficeArt();
  const hotspots = useMemo(() => computeHotspots(art.manifest), [art.manifest]);
  const world = useMemo(() => computeWorld(art.manifest), [art.manifest]);
  const [scene, setScene] = useState<Scene>('office');
  const [assembly, setAssembly] = useState<AssemblyState>(() => defaultAssembly());
  const [draftKind, setDraftKind] = useState<'assembly' | 'canvas' | null>(null);
  const [storageWarning, setStorageWarning] = useState(!draftStorageHealthy());
  const [bubble, setBubble] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<HotspotId | null>(null);
  const [reqOpen, setReqOpen] = useState(false);

  const stageRef = useRef<StageState>({
    playerX: 0,
    playerDir: 1,
    playerPose: 'idle',
    bossMood: 'idle',
    bossVisible: true,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const targetRef = useRef<{ x: number; interact: HotspotId | null } | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const sceneRef = useRef<Scene>('office');
  sceneRef.current = scene;

  // 出生在工位热点（manifest 到位后夹取到合法范围）
  useEffect(() => {
    const desk = hotspots.find((h) => h.id === 'desk');
    const st = stageRef.current;
    if (desk && (st.playerX === 0 || st.playerX < world.playerMinX || st.playerX > world.playerMaxX)) {
      st.playerX = desk.x;
    }
  }, [hotspots, world]);

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
      const text =
        id === 'kettle'
          ? '饮水机咕嘟咕嘟……这是本周第 4 桶水。你在杯子上写了「别催」，字还没干。'
          : `打印机吐出需求单：${content.config.brief.requirementLines.join('；')}。卡纸的那张是上一位设计师的辞职信。`;
      showBubble(text);
    },
    [content, showBubble],
  );

  // 键盘：移动 + 交互（输入聚焦时不劫持快捷键；编辑器/画布打开时不响应）
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
        const hotspot = hotspots.find(
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
  }, [interact, confirming, hotspots]);

  // 移动循环：直接改 stageRef，OfficeStage 每帧读取（世界坐标，速度随场景宽自适应）
  useEffect(() => {
    if (scene !== 'office') return;
    let raf = 0;
    let last = performance.now();
    const speed = Math.max(120, world.width * 0.13);
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
        if (Math.abs(diff) <= speed * dt + 1) {
          st.playerX = target.x;
          const want = target.interact;
          targetRef.current = null;
          if (want) interact(want);
        } else {
          dx = diff > 0 ? 1 : -1;
        }
      }
      if (dx !== 0) {
        st.playerX = Math.max(world.playerMinX, Math.min(world.playerMaxX, st.playerX + dx * speed * dt));
        st.playerDir = dx > 0 ? 1 : -1;
        st.playerPose = 'walk';
      } else if (st.playerPose === 'walk') {
        st.playerPose = 'idle';
      }
      const near = hotspots.find((h) => Math.abs(h.x - st.playerX) <= h.range) ?? null;
      setActiveHotspot((prev) => (prev === (near?.id ?? null) ? prev : near?.id ?? null));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, interact, hotspots, world]);

  // 点击场景：点到热点范围 → 走过去并交互；否则走到该处（幂等寻路，天然防重复触发）
  const onStageActivate = useCallback(
    (worldX: number) => {
      if (sceneRef.current !== 'office') return;
      const hotspot = hotspots.find((h) => Math.abs(h.x - worldX) <= h.range * 0.8);
      targetRef.current = { x: hotspot ? hotspot.x : worldX, interact: hotspot ? hotspot.id : null };
      keysRef.current.clear();
    },
    [hotspots],
  );

  const onHotspotActivate = useCallback(
    (id: HotspotId) => {
      if (sceneRef.current !== 'office') return;
      const hotspot = hotspots.find((h) => h.id === id);
      if (!hotspot) return;
      targetRef.current = { x: hotspot.x, interact: id };
      keysRef.current.clear();
    },
    [hotspots],
  );

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

  const goDesk = () => {
    stageRef.current.playerX = hotspots.find((h) => h.id === 'desk')?.x ?? stageRef.current.playerX;
    setReqOpen(false);
    setScene('editor');
  };

  const goBoss = () => {
    stageRef.current.playerX = Math.min(world.playerMaxX, hotspots.find((h) => h.id === 'boss')?.x ?? stageRef.current.playerX);
    setReqOpen(false);
    setConfirming(true);
  };

  return (
    <div className="office-view page bare">
      <h1 className="sr-only">差不多创意部 · 办公室</h1>

      <OfficeStage
        reduceMotion={reduceMotion}
        stateRef={stageRef}
        onStageActivate={onStageActivate}
        onHotspotActivate={onHotspotActivate}
        activeHotspot={activeHotspot}
        className="office-stage"
        ariaLabel="像素办公室：整排夕阳玻璃窗，左茶水打印区，中间白桌工位，右侧玻璃经理室。A/D 移动，E 交互。"
      />

      <div className="office-hint" aria-live="polite">
        {activeHotspot === 'desk'
          ? '到工位了——按 E 拼装落地页'
          : activeHotspot === 'boss'
            ? '雕茅经理在玻璃房里看着你——按 E 交稿评审'
            : activeHotspot
              ? `走近${hotspots.find((h) => h.id === activeHotspot)?.label}——按 E 看看`
              : 'A/D 或 ←/→ 移动 · 点击地点走过去 · E 交互'}
      </div>

      <div className={`office-req${reqOpen ? ' open' : ''}`}>
        <button
          type="button"
          className="office-req-toggle"
          aria-expanded={reqOpen}
          onClick={() => setReqOpen((v) => !v)}
        >
          需求
        </button>
        {reqOpen ? (
          <div className="office-req-panel" role="dialog" aria-label="本单需求">
            <p className="office-req-title">正式需求（逐条对）</p>
            <ol className="office-req-lines">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      {bubble ? (
        <div className="office-bubble" role="status">
          {bubble}
        </div>
      ) : null}

      <div className="office-touch">
        <div className="office-touch-move">
          <button type="button" className="touch-btn" aria-label="向左移动" {...touchHold('left')}>
            ◀
          </button>
          <button type="button" className="touch-btn" aria-label="向右移动" {...touchHold('right')}>
            ▶
          </button>
        </div>
        <button
          type="button"
          className="touch-btn act office-touch-e"
          aria-label="交互"
          onClick={() => {
            const hotspot = hotspots.find((h) => Math.abs(h.x - stageRef.current.playerX) <= h.range);
            if (hotspot) interact(hotspot.id);
          }}
        >
          E
        </button>
      </div>

      <nav className="office-quick" aria-label="快速导航">
        <button type="button" className="office-quick-btn" onClick={goDesk}>
          {draftKind === 'canvas' ? '打开拼装编辑器（当前稿件在画布）' : '回到工位编辑器'}
        </button>
        <button type="button" className="office-quick-btn" onClick={goBoss}>
          去经理室交稿
        </button>
        <button type="button" className="office-quick-btn ghost" onClick={onQuit}>
          今天不干了（退出）
        </button>
      </nav>

      {storageWarning ? (
        <div className="notice warn office-store-note" role="status">
          当前浏览器无法保存草稿，本次编辑只在内存里，刷新会丢。
        </div>
      ) : null}

      {scene === 'editor' ? (
        <div className="asm-overlay" role="presentation">
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
        </div>
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
