import { useEffect, useRef } from 'react';
import type { BossMood, PlayerPose } from './sprites';
import {
  BOSS_STEP_X,
  HOTSPOTS,
  PLAYER_MAX_X,
  PLAYER_MIN_X,
  SCENE_W,
  VIEW_H,
  VIEW_W,
  buildStaticBackground,
  clearParticles,
  drawDynamicLayer,
  drawHotspotBadge,
  type HotspotId,
  type SceneFx,
} from './sceneDraw';

export type StageMode = 'title' | 'office' | 'boss';

export type StageState = {
  playerX: number;
  playerDir: 1 | -1;
  playerPose: PlayerPose;
  bossMood: BossMood;
  bossVisible: boolean;
  fx?: SceneFx;
};

type Props = {
  mode: StageMode;
  reduceMotion: boolean;
  /** office 模式：外部受控状态（由 OfficeView 持有）；其余模式内部默认 */
  stateRef?: React.RefObject<StageState>;
  /** 点击画布（换算为舞台 x 坐标） */
  onStageClick?: (stageX: number) => void;
  /** 玩家所在热点（用于绘制提示牌） */
  activeHotspot?: HotspotId | null;
  className?: string;
  ariaLabel?: string;
};

/**
 * 2.5D 像素办公室舞台。960×420 逻辑画布，CSS 等比缩放（image-rendering: pixelated）。
 * - title：全景镜头缓慢漂移，玩家伏案睡觉
 * - office：玩家自由移动（外部 stateRef 驱动），相机平滑跟随
 * - boss：镜头锁定经理室对峙构图
 */
export function OfficeStage({
  mode,
  reduceMotion,
  stateRef,
  onStageClick,
  activeHotspot,
  className,
  ariaLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef(0);
  const clickRef = useRef(onStageClick);
  clickRef.current = onStageClick;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!bgRef.current) bgRef.current = buildStaticBackground();
    const bg = bgRef.current;

    let raf = 0;
    const start = performance.now();
    let last = start;
    clearParticles();

    const internalState: StageState = {
      playerX: 470,
      playerDir: 1,
      playerPose: mode === 'title' ? 'sleep' : mode === 'boss' ? 'submit' : 'idle',
      bossMood: mode === 'boss' ? 'angry' : 'idle',
      bossVisible: true,
    };

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const actors = stateRef?.current ?? internalState;

      // 相机：title 缓慢漂移 / office 跟随玩家 / boss 锁定经理室
      let targetCam = cameraRef.current;
      if (mode === 'title') {
        const drift = reduceMotion ? 0.5 : 0.5 + Math.sin(t * 0.14) * 0.5;
        targetCam = drift * (SCENE_W - VIEW_W);
      } else if (mode === 'boss') {
        targetCam = SCENE_W - VIEW_W;
      } else {
        targetCam = Math.max(0, Math.min(SCENE_W - VIEW_W, actors.playerX - VIEW_W / 2));
      }
      const follow = mode === 'office' ? (reduceMotion ? 1 : 0.12) : (reduceMotion ? 1 : 0.04);
      cameraRef.current += (targetCam - cameraRef.current) * follow;

      drawDynamicLayer(ctx, bg, {
        t,
        dt,
        cameraX: Math.round(cameraRef.current),
        actors,
        fx: actors.fx,
        reduceMotion,
        mode,
      });
      if (mode === 'office' && activeHotspot) {
        const hotspot = HOTSPOTS.find((h) => h.id === activeHotspot);
        if (hotspot) {
          drawHotspotBadge(ctx, Math.round(cameraRef.current), hotspot, actors.playerX, t, reduceMotion);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearParticles();
    };
  }, [mode, reduceMotion, stateRef, activeHotspot]);

  return (
    <canvas
      ref={canvasRef}
      width={VIEW_W}
      height={VIEW_H}
      className={className ?? 'office-canvas'}
      role="img"
      aria-label={ariaLabel ?? '2.5D 像素办公室：整排落地窗与夕阳城市，左侧茶水打印区，中间白色工位，右侧玻璃隔间经理室'}
      onClick={(e) => {
        if (!clickRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const viewX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
        clickRef.current(viewX + cameraRef.current);
      }}
    />
  );
}

/** Boss 对峙镜头里玩家的默认站位（台阶下仰视） */
export const BOSS_SCENE_PLAYER_X = BOSS_STEP_X - 18;
export const OFFICE_BOUNDS = { minX: PLAYER_MIN_X, maxX: PLAYER_MAX_X };
