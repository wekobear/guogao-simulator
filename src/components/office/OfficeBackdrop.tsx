import { useEffect, useRef } from 'react';
import { computeWorld, useOfficeArt } from './artAssets';
import { clampCamera, paintBoss, paintPlayer, paintScene, stageLayout } from './artRender';

export type BackdropMode = 'title' | 'office' | 'boss';

type Props = {
  mode: BackdropMode;
  reduceMotion: boolean;
  /** 压暗系数 0–1（面板视图叠加深色遮罩，保证前景可读） */
  dim?: number;
  className?: string;
};

/**
 * 全屏办公室美术背景（v0.3.0 GameShell 底层）。
 * 真实环境图 cover 渲染：title 缓慢漂移 + 玩家走道踱步；office/boss 静态取景
 * （boss 锁定经理室）。素材未到位时自动回退旧程序场景，加载后热切换。
 */
export function OfficeBackdrop({ mode, reduceMotion, dim = 0, className }: Props) {
  const art = useOfficeArt();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const world = computeWorld(art.manifest);
    const strip = art.playerStrip ? { img: art.playerStrip, meta: art.manifest.playerStrip } : null;
    let raf = 0;
    let cw = 0;
    let ch = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cw = Math.max(1, Math.round(rect.width));
      ch = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 重设画布尺寸会清空 Canvas：静态取景模式没有下一帧 rAF，必须在此重绘
      if (mode !== 'title' || reduceMotion) drawFrame(lastT);
    };

    let lastT = 0.5;
    const drawFrame = (t: number) => {
      lastT = t;
      const layout = stageLayout(cw, ch, world.width, world.height);
      let camX: number;
      let playerX: number;
      let frame = 0;
      let dir: 1 | -1 = 1;
      if (mode === 'title') {
        // 全景漂移：0 → max 往返（约 26s 一个来回）
        const max = Math.max(0, world.width - layout.viewWorldW);
        const phase = reduceMotion ? 0.5 : (Math.sin(t * 0.24) + 1) / 2;
        camX = phase * max;
        // 玩家在走道来回踱步（世界 10%–88%）
        const span = world.playerMaxX - world.playerMinX;
        const walkPhase = reduceMotion ? 0.5 : (Math.sin(t * 0.17) + 1) / 2;
        playerX = world.playerMinX + span * walkPhase;
        dir = Math.cos(t * 0.17) >= 0 ? 1 : -1;
        frame = reduceMotion ? 0 : Math.floor(t / 0.28) % 2 === 0 ? 1 : 2;
      } else if (mode === 'boss') {
        camX = clampCamera(world.bossX - layout.viewWorldW * 0.42, world.width, layout.viewWorldW);
        playerX = Math.max(world.playerMinX, world.bossX - layout.viewWorldW * 0.3);
        frame = 0;
      } else {
        camX = clampCamera((world.width - layout.viewWorldW) / 2, world.width, layout.viewWorldW);
        playerX = Math.round(world.width * 0.5);
        frame = 0;
      }

      paintScene({ ctx, cw, ch, camX, layout, worldW: world.width, worldH: world.height, scene: art.scene });
      // 经理常驻经理室；玩家按模式站位（office 面板视图在工位 idle）
      paintBoss({
        ctx,
        camX,
        layout,
        worldX: world.bossX,
        feetY: world.feetY,
        worldH: world.bossH,
        dir: -1,
        img: art.boss,
        manifest: art.manifest,
        mood: mode === 'boss' ? 'angry' : 'idle',
      });
      paintPlayer({
        ctx,
        camX,
        layout,
        worldX: playerX,
        feetY: world.feetY,
        worldH: world.playerH,
        dir,
        strip,
        frameIndex: frame,
        pose: 'idle',
      });

      if (dim > 0) {
        ctx.fillStyle = `rgba(14,11,20,${dim})`;
        ctx.fillRect(0, 0, cw, ch);
      }
    };

    // 尺寸初始化与观察（resize 内静态模式会自行重绘一帧）
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // title 有漂移/踱步 → 持续动画；其余静态取景由 resize() 首绘
    // （资产/模式变化由 effect 重跑覆盖；容器尺寸变化走 ResizeObserver 重绘）
    if (mode === 'title' && !reduceMotion) {
      const start = performance.now();
      const loop = (now: number) => {
        drawFrame((now - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [art, mode, reduceMotion, dim]);

  return (
    <div ref={wrapRef} className={className ?? 'scene-layer'} aria-hidden="true">
      <canvas ref={canvasRef} className="scene-canvas" />
    </div>
  );
}
