/**
 * 真实美术资产的舞台渲染工具（v0.3.0 fullscene）。
 *
 * 世界坐标 = office-scene.png 的像素坐标；容器按「高度定标」渲染整幅场景，
 * 视口世界宽 = 容器宽 / 缩放，相机水平平移（内部 pan/crop，不拉伸、不动 body）。
 * 超宽容器（视口世界宽 > 场景宽）改按宽度定标并上下裁切，保证永远有画面。
 * sprite 与场景任一缺失时回退旧程序绘制（sceneDraw / sprites）。
 */

import { buildStaticBackground } from './sceneDraw';
import { drawBoss, drawPlayer, type BossMood, type PlayerPose } from './sprites';
import type { ArtManifest, PlayerStripMeta } from './artAssets';

export type StageLayout = {
  /** 世界像素 → 屏幕像素 */
  scale: number;
  /** 视口可见的世界宽度 */
  viewWorldW: number;
  /** 场景绘制纵向偏移（高度定标时 0，宽度定标时 <0 上下裁） */
  offsetY: number;
};

/** 按容器与世界尺寸计算 cover 布局（高度定标优先，超宽时宽度定标） */
export function stageLayout(containerW: number, containerH: number, worldW: number, worldH: number): StageLayout {
  let scale = containerH / worldH;
  let viewWorldW = containerW / scale;
  if (viewWorldW > worldW) {
    scale = containerW / worldW;
    viewWorldW = worldW;
  }
  const offsetY = (containerH - worldH * scale) / 2;
  return { scale, viewWorldW, offsetY };
}

/** 相机横向夹取：viewWorldW ≥ worldW 时居中（camX 为负值居中） */
export function clampCamera(camX: number, worldW: number, viewWorldW: number): number {
  const max = worldW - viewWorldW;
  if (max <= 0) return max / 2; // 负值 → 绘制时场景整体右移居中
  return Math.max(0, Math.min(max, camX));
}

let fallbackScene: HTMLCanvasElement | null = null;

/** 旧程序办公室（1280×420）缓存；真实场景图缺失时的背景兜底 */
export function fallbackSceneCanvas(): HTMLCanvasElement {
  if (!fallbackScene) fallbackScene = buildStaticBackground();
  return fallbackScene;
}

export type ScenePainterOptions = {
  ctx: CanvasRenderingContext2D;
  /** 容器 CSS 尺寸 */
  cw: number;
  ch: number;
  camX: number;
  layout: StageLayout;
  worldW: number;
  worldH: number;
  scene: HTMLImageElement | null;
};

/** 画整幅办公室背景（真实图或程序兜底），带相机偏移；像素风关闭平滑 */
export function paintScene(opts: ScenePainterOptions): void {
  const { ctx, cw, ch, camX, layout, worldW, worldH, scene } = opts;
  const { scale, offsetY } = layout;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#15121e';
  ctx.fillRect(0, 0, cw, ch);
  const dx = -camX * scale;
  const dw = worldW * scale;
  const dh = worldH * scale;
  if (scene) {
    ctx.drawImage(scene, dx, offsetY, dw, dh);
  } else {
    // 兜底：程序场景拉伸到同一世界矩形（临时态，素材到位后自动热切换）
    ctx.drawImage(fallbackSceneCanvas(), dx, offsetY, dw, dh);
  }
}

/* ---------------- 角色 sprite（registration 驱动裁剪绘制） ---------------- */

export type SpriteFrameSource = {
  img: HTMLImageElement;
  meta?: PlayerStripMeta;
};

export type DrawActorOptions = {
  ctx: CanvasRenderingContext2D;
  camX: number;
  layout: StageLayout;
  /** 脚底中心的世界 x */
  worldX: number;
  /** 脚底世界 y */
  feetY: number;
  /** 可见身高（世界像素；不是透明方格高） */
  worldH: number;
  dir: 1 | -1;
};

/**
 * 通用角色绘制：按源裁剪矩形 + anchor 定位（世界 x 对齐 anchor x、脚线对齐 anchor y），
 * 向左时围绕 worldX 镜像（不围绕透明方格边缘）。k = 源像素 → 屏幕像素。
 */
function drawActorCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: { x: number; y: number; width: number; height: number },
  anchor: { x: number; y: number },
  k: number,
  px: number,
  py: number,
  mirror: boolean,
): void {
  ctx.imageSmoothingEnabled = false;
  if (mirror) {
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(-1, 1);
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, -anchor.x * k, -anchor.y * k, rect.width * k, rect.height * k);
    ctx.restore();
  } else {
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, px - anchor.x * k, py - anchor.y * k, rect.width * k, rect.height * k);
  }
}

/**
 * 玩家：frameRegistration 驱动——固定 scale = worldH / scaleReferenceVisibleHeightPx，
 * 每帧画有效裁剪矩形，worldX 对齐头部 anchor（吸收 AI strip 的帧间横向漂移），
 * 脚底 anchor 贴世界脚线。无 registration 元数据时回退程序 sprite（不猜透明余白）。
 */
export function paintPlayer(
  opts: DrawActorOptions & {
    strip: SpriteFrameSource | null;
    frameIndex: number;
    pose: PlayerPose;
    breathe?: 0 | 1;
  },
): void {
  const { ctx, camX, layout, worldX, feetY, worldH, dir, strip, frameIndex, pose, breathe } = opts;
  const { scale, offsetY } = layout;
  const reg = strip?.meta?.frameRegistration;
  if (strip && reg && reg.length > 0) {
    const frames = reg.length;
    const i = ((frameIndex % frames) + frames) % frames;
    const f = reg[i]!;
    const refH = strip.meta?.scaleReferenceVisibleHeightPx ?? f.sourceCropRect.height;
    const k = (worldH / refH) * scale; // 源 px → 屏幕 px，动画期间固定
    drawActorCrop(
      ctx,
      strip.img,
      f.sourceCropRect,
      { x: f.headAnchorInCropPx.x, y: f.feetAnchorInCropPx.y },
      k,
      (worldX - camX) * scale,
      feetY * scale + offsetY,
      dir === -1,
    );
    return;
  }
  // 程序兜底：26 行网格 sprite，按可见身高换算倍率
  const s = (worldH * scale) / 26;
  const px = (worldX - camX) * scale - 7 * s;
  const py = feetY * scale + offsetY - 26 * s;
  drawPlayer(ctx, px, py, { pose, dir, breathe, scale: s });
}

/**
 * 经理：boss-idle 单帧，原生朝向来自 manifest（素材原生朝左）。
 * 只有目标方向与原生方向不同才镜像；worldH 为有效可见身高，按 bbox 裁剪绘制。
 */
export function paintBoss(
  opts: DrawActorOptions & {
    img: HTMLImageElement | null;
    manifest: ArtManifest;
    mood: BossMood;
    glare?: boolean;
  },
): void {
  const { ctx, camX, layout, worldX, feetY, worldH, dir, img, manifest, mood, glare } = opts;
  const { scale, offsetY } = layout;
  const meta = manifest.bossIdle;
  const b = meta?.solidPixelBounds;
  if (img && meta && b && b.length === 4) {
    const [l, t, r, bt] = b as [number, number, number, number];
    const cropW = r - l;
    const cropH = bt - t;
    const feet = meta.feetAnchorsPerFrame?.[0];
    const ax = feet ? feet.x * meta.width - l : cropW / 2;
    const ay = feet ? feet.feetY * meta.height - t : cropH;
    const nativeDir: 1 | -1 = /left/i.test(meta.facing ?? '') ? -1 : 1;
    const k = (worldH / cropH) * scale;
    drawActorCrop(
      ctx,
      img,
      { x: l, y: t, width: cropW, height: cropH },
      { x: ax, y: ay },
      k,
      (worldX - camX) * scale,
      feetY * scale + offsetY,
      dir !== nativeDir,
    );
    return;
  }
  if (img) {
    // 有图无 bbox 元数据：整图居中贴地（不翻转，保持原生朝向）
    const k = (worldH / img.height) * scale;
    drawActorCrop(
      ctx,
      img,
      { x: 0, y: 0, width: img.width, height: img.height },
      { x: img.width / 2, y: img.height },
      k,
      (worldX - camX) * scale,
      feetY * scale + offsetY,
      false,
    );
    return;
  }
  const s = (worldH * scale) / 28;
  const bx = (worldX - camX) * scale - 9 * s;
  const by = feetY * scale + offsetY - 28 * s;
  drawBoss(ctx, bx, by, { mood, glare, scale: s });
}

/** 屏幕坐标 → 世界 x（点击/触控换算） */
export function screenToWorldX(clientX: number, rectLeft: number, camX: number, layout: StageLayout): number {
  return (clientX - rectLeft) / layout.scale + camX;
}
