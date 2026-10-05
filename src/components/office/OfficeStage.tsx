import { useEffect, useRef } from 'react';
import type { PlayerPose, BossMood } from './sprites';
import { computeHotspots, computeWorld, useOfficeArt, type HotspotId } from './artAssets';
import { clampCamera, paintBoss, paintPlayer, paintScene, stageLayout } from './artRender';

export type StageState = {
  /** 玩家脚底中心的世界 x（office-scene.png 像素坐标） */
  playerX: number;
  playerDir: 1 | -1;
  playerPose: PlayerPose;
  bossMood: BossMood;
  bossVisible: boolean;
};

type Props = {
  reduceMotion: boolean;
  /** 外部受控状态（OfficeView 持有并驱动移动） */
  stateRef: React.RefObject<StageState>;
  /** 点击/触点场景（换算后的世界 x）：寻路走过去 */
  onStageActivate?: (worldX: number) => void;
  /** 点击热点徽标：走过去并交互 */
  onHotspotActivate?: (id: HotspotId) => void;
  /** 玩家所在热点（徽标高亮 + 键提示） */
  activeHotspot?: HotspotId | null;
  className?: string;
  ariaLabel?: string;
};

/**
 * 认真模式交互舞台（v0.3.0）：真实环境图 + sprite，fill 容器。
 * 相机按容器实际宽高计算视口世界宽并平滑跟随玩家——PC 看到宽全景，
 * 手机角色清晰且镜头可抵达茶水与经理室；背景内部 pan/crop，不拉伸。
 * 交互提示用真实 HTML 徽标（中文可读、可点），每帧贴热点世界坐标。
 */
export function OfficeStage({
  reduceMotion,
  stateRef,
  onStageActivate,
  onHotspotActivate,
  activeHotspot,
  className,
  ariaLabel,
}: Props) {
  const art = useOfficeArt();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const badgeRefs = useRef(new Map<HotspotId, HTMLButtonElement>());
  const activateRef = useRef(onStageActivate);
  activateRef.current = onStageActivate;
  // near 高亮由 rAF 内 classList 处理，不进 effect 依赖（避免相机重启跳动）
  const activeRef = useRef(activeHotspot);
  activeRef.current = activeHotspot;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const world = computeWorld(art.manifest);
    const hotspots = computeHotspots(art.manifest);
    const strip = art.playerStrip ? { img: art.playerStrip, meta: art.manifest.playerStrip } : null;
    // 徽标悬浮高度：高于场上最高人物（经理 0.29H > 玩家 0.26H）再加余量，
    // 标牌整体落在人物头顶之上，不遮脚/腿/身体，也不压场景物件主体
    const badgeLift = Math.max(world.playerH, world.bossH) + Math.round(world.height * 0.045);
    let raf = 0;
    let camX = 0;
    // 首帧先对准玩家再进入平滑跟随：进场/素材热切换重建 effect 时玩家完整在屏，
    // 不从 camX=0 缓慢滑入（手机窄视口会长时间看不见角色）
    let camLocked = false;
    let cw = 0;
    let ch = 0;
    let lastMetaDump = 0;

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
      // 视口宽高变化后视口世界宽随之改变，按新夹取范围修正相机（不越界）
      camX = clampCamera(camX, world.width, stageLayout(cw, ch, world.width, world.height).viewWorldW);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const actors = stateRef.current;
      const layout = stageLayout(cw, ch, world.width, world.height);

      // 相机平滑跟随玩家（reduceMotion 直接贴合；首帧直接锁定目标）
      const targetCam = clampCamera(
        actors.playerX - layout.viewWorldW / 2,
        world.width,
        layout.viewWorldW,
      );
      if (!camLocked) {
        camX = targetCam;
        camLocked = true;
      } else {
        camX = reduceMotion
          ? targetCam
          : camX + (targetCam - camX) * 0.12;
      }
      camX = clampCamera(camX, world.width, layout.viewWorldW);

      paintScene({ ctx, cw, ch, camX, layout, worldW: world.width, worldH: world.height, scene: art.scene });
      if (actors.bossVisible) {
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
          mood: actors.bossMood,
        });
      }
      const walking = actors.playerPose === 'walk';
      const frameIndex = walking ? (Math.floor(t / 0.26) % 2 === 0 ? 1 : 2) : 0;
      paintPlayer({
        ctx,
        camX,
        layout,
        worldX: actors.playerX,
        feetY: world.feetY,
        worldH: world.playerH,
        dir: actors.playerDir,
        strip,
        frameIndex,
        pose: actors.playerPose,
      });

      // HTML 徽标贴热点（真实 DOM，中文可读、可点）：锚在人物头顶上方的悬浮高度
      for (const h of hotspots) {
        const el = badgeRefs.current.get(h.id);
        if (!el) continue;
        const x = (h.x - camX) * layout.scale;
        const y = (world.feetY - badgeLift) * layout.scale + layout.offsetY;
        const off = x < -80 || x > cw + 80;
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
        el.style.visibility = off ? 'hidden' : 'visible';
        el.classList.toggle('near', activeRef.current === h.id);
      }

      // 低频 meta dump：E2E / 调试读取相机与布局
      if (now - lastMetaDump > 200) {
        lastMetaDump = now;
        canvas.dataset.cam = camX.toFixed(1);
        canvas.dataset.scale = layout.scale.toFixed(4);
        canvas.dataset.viewWorldW = layout.viewWorldW.toFixed(1);
        canvas.dataset.playerX = actors.playerX.toFixed(1);
        // 截图/断言用：真实场景图是否就绪、玩家头顶与脚线的屏幕 y
        canvas.dataset.scene = art.scene ? '1' : '0';
        canvas.dataset.headTopY = ((world.feetY - world.playerH) * layout.scale + layout.offsetY).toFixed(1);
        canvas.dataset.feetY = (world.feetY * layout.scale + layout.offsetY).toFixed(1);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onPointerDown = (e: PointerEvent) => {
      if (!activateRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const worldX = (e.clientX - rect.left) / stageLayout(cw, ch, world.width, world.height).scale + camX;
      activateRef.current(Math.max(0, Math.min(world.width, worldX)));
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [art, reduceMotion, stateRef]);

  const hotspots = computeHotspots(art.manifest);

  return (
    <div ref={wrapRef} className={className ?? 'office-stage'} aria-label={ariaLabel}>
      <canvas
        ref={canvasRef}
        className="office-canvas stage-canvas"
        role="application"
        aria-label={ariaLabel ?? '像素办公室：A/D 移动，E 交互；点地点走过去，点徽标直达'}
        data-scene-w={art.manifest.office.width}
        data-scene-h={art.manifest.office.height}
      />
      <div className="stage-badges" aria-live="polite">
        {hotspots.map((h) => (
          <button
            key={h.id}
            ref={(el) => {
              if (el) badgeRefs.current.set(h.id, el);
              else badgeRefs.current.delete(h.id);
            }}
            type="button"
            className={`stage-badge${activeHotspot === h.id ? ' near' : ''}`}
            data-hotspot={h.id}
            onClick={() => onHotspotActivate?.(h.id)}
          >
            <span className="stage-badge-key" aria-hidden="true">
              E
            </span>
            <span className="stage-badge-label">{h.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { computeHotspots, computeWorld };
