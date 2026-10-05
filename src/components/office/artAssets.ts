/**
 * 全屏办公室美术资产接入（v0.3.0 fullscene）。
 *
 * 真实 raster 资产由主 Agent 生成并放在 public/art/：
 *   office-scene.png  无 UI 无角色的完整干净办公室（约 16:9，左茶水中工位右经理）
 *   player-strip.png  透明一行 3 等宽帧（idle / walk1 / walk2，面朝右）
 *   boss-idle.png     透明全身经理
 * 元数据 manifest 由构建前脚本 tools/sync-art.mjs 从协调目录拷到
 * public/art/asset-manifest.json；运行时 fetch 覆盖下面的默认值。
 * 任一资产缺失/失败时回退到旧程序绘制（sceneDraw/sprites），加载完成后热切换。
 */

import { useEffect, useState } from 'react';

export type FocalPoint = { x: number; y: number };

export type OfficeArtMeta = {
  width: number;
  height: number;
  focalPoints: {
    teaPrinter: FocalPoint;
    workstations: FocalPoint;
    managerOffice: FocalPoint;
  };
  walkableFloor: { topY: number; bottomY: number; recommendedFeetY: number };
};

export type FrameRect = { x: number; y: number; width: number; height: number };

/** 每帧注册信息：有效裁剪矩形 + 头/脚 anchor（源像素，bbox alpha≥128，右下排他） */
export type PlayerFrameRegistration = {
  index: number;
  pose: string;
  sourceFrameRect: FrameRect;
  sourceCropRect: FrameRect;
  visibleHeightPx: number;
  headAnchorLocalPx: { x: number };
  feetAnchorLocalPx: { x: number; y: number };
  headAnchorInCropPx: { x: number };
  feetAnchorInCropPx: { x: number; y: number };
  horizontalCorrectionToIdlePx: number;
};

export type PlayerStripMeta = {
  width: number;
  height: number;
  frames: number;
  /** 固定缩放基准：idle 帧有效身高（源 px）；scale = 可见身高 / 该值，动画期间不变 */
  scaleReferenceVisibleHeightPx?: number;
  frameRegistration?: PlayerFrameRegistration[];
  frameOrder?: string[];
  /** 原生朝向（如 "right; mirror ..."） */
  facing?: string;
  /** 人物可见身高占场景高比例（缺省 0.26） */
  worldHeightRatio?: number;
};

export type BossArtMeta = {
  width: number;
  height: number;
  /** 有效 bbox [left, top, right, bottom]（alpha≥128，右下排他） */
  solidPixelBounds?: [number, number, number, number];
  feetAnchorsPerFrame?: { x: number; feetY: number; visibleHeight: number }[];
  /** 原生朝向（如 "left three-quarter"） */
  facing?: string;
  /** 可见身高占场景高比例（缺省 0.29） */
  worldHeightRatio?: number;
};

export type ArtManifest = {
  office: OfficeArtMeta;
  playerStrip?: PlayerStripMeta;
  bossIdle?: BossArtMeta;
};

/**
 * 内置兜底（仅 office 布局元数据）：public/art/asset-manifest.json 由
 * tools/sync-art.mjs 从协调目录转换生成（assets.office/player/boss →
 * office/playerStrip/bossIdle，保留 frameRegistration 与 anchor）。
 * fetch 失败或形状不合法时使用本默认值，角色回退程序 sprite。
 */
export const DEFAULT_MANIFEST: ArtManifest = {
  office: {
    width: 1672,
    height: 941,
    focalPoints: {
      teaPrinter: { x: 0.11, y: 0.5 },
      workstations: { x: 0.5, y: 0.51 },
      managerOffice: { x: 0.88, y: 0.48 },
    },
    walkableFloor: { topY: 0.62, bottomY: 0.97, recommendedFeetY: 0.8 },
  },
};

export const OFFICE_SCENE_URL = '/art/office-scene.png';
export const PLAYER_STRIP_URL = '/art/player-strip.png';
export const BOSS_IDLE_URL = '/art/boss-idle.png';
const MANIFEST_URL = '/art/asset-manifest.json';

/* ---------------- 世界坐标（热点 / 地板 / 活动范围，均为世界比例） ---------------- */

export type HotspotId = 'kettle' | 'printer' | 'desk' | 'boss';

export type HotspotDef = {
  id: HotspotId;
  /** 世界 x 比例（office.width 乘数） */
  xr: number;
  /** 触发半径（世界 x 比例） */
  rangeR: number;
  label: string;
  hint: string;
};

/** 热点落位：茶水/打印取 teaPrinter 焦点两侧，工位取 workstations，经理室取 managerOffice 前走道 */
export const HOTSPOT_DEFS: readonly HotspotDef[] = [
  { id: 'kettle', xr: 0.075, rangeR: 0.05, label: '茶水间', hint: '摸鱼接水' },
  { id: 'printer', xr: 0.16, rangeR: 0.05, label: '打印机', hint: '打印需求单' },
  { id: 'desk', xr: 0.5, rangeR: 0.055, label: '你的工位', hint: '拼装落地页' },
  { id: 'boss', xr: 0.845, rangeR: 0.05, label: '经理室', hint: '交稿评审' },
] as const;

/** 玩家横向活动范围（世界比例）：不上经理地台 */
export const PLAYER_BOUNDS_R = { minX: 0.03, maxX: 0.81 } as const;

export type Hotspot = { id: HotspotId; x: number; range: number; label: string; hint: string };

/** 由 manifest 计算具体世界坐标（整数像素） */
export function computeHotspots(manifest: ArtManifest): Hotspot[] {
  const w = manifest.office.width;
  return HOTSPOT_DEFS.map((h) => ({
    id: h.id,
    x: Math.round(h.xr * w),
    range: Math.round(h.rangeR * w),
    label: h.label,
    hint: h.hint,
  }));
}

export function computeWorld(manifest: ArtManifest) {
  const { width, height, walkableFloor, focalPoints } = manifest.office;
  return {
    width,
    height,
    feetY: Math.round(walkableFloor.recommendedFeetY * height),
    playerMinX: Math.round(PLAYER_BOUNDS_R.minX * width),
    playerMaxX: Math.round(PLAYER_BOUNDS_R.maxX * width),
    bossX: Math.round(focalPoints.managerOffice.x * width * 0.985),
    /** 玩家可见身高（不是透明方格高；绘制按 anchor 换算） */
    playerH: Math.round((manifest.playerStrip?.worldHeightRatio ?? 0.26) * height),
    /** 经理可见身高 */
    bossH: Math.round((manifest.bossIdle?.worldHeightRatio ?? 0.29) * height),
  };
}

/* ---------------- 加载与订阅 ---------------- */

export type OfficeArt = {
  manifest: ArtManifest;
  scene: HTMLImageElement | null;
  playerStrip: HTMLImageElement | null;
  boss: HTMLImageElement | null;
};

let state: OfficeArt = { manifest: DEFAULT_MANIFEST, scene: null, playerStrip: null, boss: null };
let loading = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadAll(): Promise<void> {
  if (loading) return;
  loading = true;
  // manifest 与三张图并行；任一失败保留 null，由调用方回退程序绘制
  const manifestPromise = fetch(MANIFEST_URL, { cache: 'force-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<ArtManifest>) : null))
    .catch(() => null);
  const [manifest, scene, playerStrip, boss] = await Promise.all([
    manifestPromise,
    loadImage(OFFICE_SCENE_URL),
    loadImage(PLAYER_STRIP_URL),
    loadImage(BOSS_IDLE_URL),
  ]);
  // 浅合并：只接受结构合法的运行时形状 manifest，防止坏数据撑爆布局；
  // playerStrip/bossIdle 缺字段时丢弃该角色元数据（回退程序 sprite），不影响场景
  const merged: ArtManifest =
    manifest && typeof manifest.office?.width === 'number' && manifest.office.width > 0
      ? {
          ...DEFAULT_MANIFEST,
          ...manifest,
          office: { ...DEFAULT_MANIFEST.office, ...manifest.office },
          playerStrip:
            manifest.playerStrip && typeof manifest.playerStrip.width === 'number' && manifest.playerStrip.frames > 0
              ? manifest.playerStrip
              : undefined,
          bossIdle:
            manifest.bossIdle && typeof manifest.bossIdle.width === 'number'
              ? manifest.bossIdle
              : undefined,
        }
      : DEFAULT_MANIFEST;
  state = { manifest: merged, scene, playerStrip, boss };
  notify();
}

/** 订阅资产状态；首次挂载触发加载，资产到位后重渲染 */
export function useOfficeArt(): OfficeArt {
  const [, setTick] = useState(0);
  useEffect(() => {
    void loadAll();
    const fn = () => setTick((v) => v + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return state;
}

/** 测试/SSR 直取当前状态 */
export function currentArt(): Readonly<OfficeArt> {
  return state;
}
