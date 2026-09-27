/**
 * 2.5D 剖面办公室场景绘制（Canvas2D，纯程序像素，原创）。
 *
 * 现代高层开放办公：整排黑灰细框落地窗 + 灰卷帘（只降下顶部约 1/5），
 * 窗外浅蓝天空、桃金晚霞与阶梯像素落日；室内白色裸顶管线横梁 +
 * 悬吊细长条 LED 灯、灰色地毯砖、背景成排 0.7 尺度工位、白色长桌与低隔板、
 * 灰网面黑框人体工学椅（带头枕）、白色方柱 + 浅木开放格 + 黑色挂屏、
 * 长条白色花槽绿叶；经理区为同一办公室内的玻璃隔间 + 现代白桌 + 黑色展示屏。
 *
 * 舞台 1280×420 逻辑像素，视口 960×420，相机水平平移。
 * 分层：Z0 窗外城市 → Z1 建筑骨架（裸顶/窗墙/地毯/剖面基座）→ Z2 家具静物
 *      → Z3 角色（sprites.ts）→ Z4 前景遮挡 → Z5 光影滤镜。
 * 静态层（Z0–Z2）缓存进离屏 canvas，每帧只画动态细节与角色。
 */

import { PAL } from './palette';
import {
  BOSS_SPRITE_ROWS,
  PLAYER_SPRITE_ROWS,
  drawBoss,
  drawPlayer,
  drawZzz,
  type BossMood,
  type PlayerPose,
} from './sprites';

export const SCENE_W = 1280;
export const VIEW_W = 960;
export const VIEW_H = 420;

/** 角色像素倍率：1 字符 = 3 逻辑像素（玩家 26 行 ≈ 78px，经理 28 行 = 84px） */
export const ACTOR_SCALE = 3;
export const PLAYER_SPRITE_H = PLAYER_SPRITE_ROWS * ACTOR_SCALE;
export const BOSS_SPRITE_H = BOSS_SPRITE_ROWS * ACTOR_SCALE;

/** 纵向结构线 */
export const CEIL_Y = 36; // 白色裸顶下沿
export const WALL_TOP = CEIL_Y;
export const WALL_BOTTOM = 190; // （旧地脚线，保留导出坐标）
export const FLOOR_TOP = 200; // 地毯透视起点
export const FLOOR_BOTTOM = 340; // 地毯前缘
export const BASE_TOP = 340; // 剖面混凝土基座
export const PLAYER_FOOT_Y = 330; // 主地毯上角色脚底
export const BOSS_FLOOR_Y = 312; // 经理隔间抬高地面
/** 坐在工位椅上时的 sprite 顶 y：手正好搭在桌面上（桌板 242） */
const SEAT_PY = 226;
/** 工位桌面高度（屏幕/蒸汽/键盘锚点共用） */
const DESK_TOP_Y = 242;

/** 落地窗墙纵向范围：帘轨到窗台 */
const WIN_TOP = 54;
const WIN_BOTTOM = 214;

/** 横向分区 */
export const TEA_ZONE = 320; // 茶水/打印区右界
export const BOSS_STEP_X = 800; // 经理隔间台阶起点
export const BOSS_WALL_X = 860; // 玻璃隔断位置

/** 玩家活动范围（主地毯，不上经理隔间地台） */
export const PLAYER_MIN_X = 40;
export const PLAYER_MAX_X = 788;

export type HotspotId = 'kettle' | 'printer' | 'desk' | 'boss';
export type Hotspot = { id: HotspotId; x: number; range: number; label: string; hint: string };

/** 交互热点：走近后 E/空格交互 */
export const HOTSPOTS: readonly Hotspot[] = [
  { id: 'printer', x: 205, range: 55, label: '打印机', hint: '打印需求单' },
  { id: 'kettle', x: 95, range: 60, label: '茶水间', hint: '摸鱼接水' },
  { id: 'desk', x: 470, range: 70, label: '你的工位', hint: '拼装落地页' },
  { id: 'boss', x: 788, range: 62, label: '经理室', hint: '交稿评审' },
] as const;

/* ---------------- 小工具：整数像素 ---------------- */

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** 确定性伪随机（窗外楼影等静态纹理，不用 Math.random 保持画面稳定） */
function hash01(seed: number): number {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------------- Z0 窗外：夕阳城市 ---------------- */

/**
 * 整片窗外景：浅蓝灰天空 → 桃金夕阳 → 远山水面 → 两层城市楼群。
 * 画在整面窗墙范围内，之后再叠卷帘与窗框分段。
 */
function drawSkyline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 天空色带：整幅铺满（上部浅蓝，自 0.25 起明显桃金晚霞并一直暖到底）
  const bands: [number, string][] = [
    [0.0, PAL.skyHigh],
    [0.14, PAL.skyMid],
    [0.25, PAL.skyWarm],
    [0.5, PAL.sunsetGold],
    [0.75, PAL.sunsetPeach],
  ];
  for (let i = 0; i < bands.length; i += 1) {
    const y0 = y + Math.round(h * bands[i]![0]);
    const y1 = i === bands.length - 1 ? y + h : y + Math.round(h * bands[i + 1]![0]);
    rect(ctx, x, y0, w, y1 - y0, bands[i]![1]);
  }
  // 阶梯圆像素落日（半径约 12，整体位于 y130 中横梃上方，不被遮挡）
  const sunX = x + Math.round(w * 0.74);
  const sunY = y + Math.round(h * 0.38);
  for (let dy = -12; dy < 12; dy += 3) {
    const hw = Math.round(Math.sqrt(144 - (dy + 1.5) * (dy + 1.5)));
    rect(ctx, sunX - hw, sunY + dy, hw * 2, 3, PAL.sunCore);
  }
  for (let dy = -6; dy < 6; dy += 2) {
    const hw = Math.round(Math.sqrt(36 - (dy + 1) * (dy + 1)));
    rect(ctx, sunX - hw, sunY + dy, hw * 2, 2, PAL.sunCoreLit);
  }
  // 细长亮金云层（阶梯端头横云）
  for (let i = 0; i < 3; i += 1) {
    const cy = y + Math.round(h * (0.26 + i * 0.08));
    const cx = x + 30 + Math.round(hash01(i * 7.7 + 2) * (w - 180));
    const cw = 48 + Math.round(hash01(i * 3.3 + 5) * 56);
    rect(ctx, cx, cy, cw, 2, 'rgba(250,224,170,0.55)');
    rect(ctx, cx - 10, cy + 2, 22, 1, 'rgba(250,224,170,0.32)');
    rect(ctx, cx + cw - 16, cy + 2, 26, 1, 'rgba(250,224,170,0.32)');
  }
  // 远山/远水横带（低平山影，两层交替）
  const ridgeY = y + Math.round(h * 0.7);
  for (let i = 0; i < 10; i += 1) {
    const mx = x + i * Math.ceil(w / 10);
    const mh = 6 + Math.round(hash01(i * 6.3) * 10);
    const color = i % 2 === 0 ? '#7b93a8' : '#869bb0';
    rect(ctx, mx, ridgeY - mh, Math.ceil(w / 10) + 8, mh, color);
    rect(ctx, mx + 8, ridgeY - Math.round(mh * 0.55), Math.ceil(w / 10) - 6, Math.round(mh * 0.55), color);
  }
  rect(ctx, x, ridgeY, w, 4, PAL.waterline);
  // 两层城市楼群（远浅近深 + 夕阳反光亮窗）
  const skyline = (baseY: number, maxH: number, color: string, seed: number, lit: boolean) => {
    let bx = x;
    let i = 0;
    while (bx < x + w) {
      const bw = 12 + Math.round(hash01(seed + i * 3.7) * 24);
      const bh = 8 + Math.round(hash01(seed + i * 9.1) * (maxH - 8));
      rect(ctx, bx, baseY - bh, Math.min(bw, x + w - bx), bh, color);
      if (lit && hash01(seed + i * 5.1) > 0.5) {
        rect(ctx, bx + 3, baseY - bh + 3, 2, 2, PAL.cityLit);
        if (bh > 24) rect(ctx, bx + 7, baseY - bh + 8, 2, 2, PAL.cityLit);
      }
      bx += bw + 3;
      i += 1;
    }
  };
  skyline(y + Math.round(h * 0.76), 24, PAL.cityFar, 11, false);
  skyline(y + Math.round(h * 0.84), 36, PAL.cityNear, 47, true);
  // 水面/低地带 + 水平高光
  const waterY = y + Math.round(h * 0.84);
  rect(ctx, x, waterY, w, y + h - waterY, PAL.waterline);
  for (let i = 0; i < 22; i += 1) {
    const lx = x + 6 + Math.round(hash01(i * 4.7) * (w - 14));
    const ly = waterY + 4 + Math.round(hash01(i * 8.3) * (y + h - waterY - 8));
    rect(ctx, lx, ly, 6 + Math.round(hash01(i * 2.9) * 10), 1, 'rgba(244,217,168,0.35)');
  }
}

/** 落地窗墙：整片窗景 + 灰卷帘（顶部约 1/5）+ 黑灰细框 + 玻璃反光 */
function drawWindowWall(ctx: CanvasRenderingContext2D): void {
  const x0 = 14;
  const x1 = 1266;
  const w = x1 - x0;
  // 顶墙带（裸顶下沿到帘轨）
  rect(ctx, 0, CEIL_Y, SCENE_W, WIN_TOP - CEIL_Y, '#b8bdc7');
  rect(ctx, 0, CEIL_Y, SCENE_W, 1, '#878e9a');
  rect(ctx, x0, WIN_TOP - 4, w, 1, '#4a4f58');
  // 窗外景（整片）
  drawSkyline(ctx, x0, WIN_TOP, w, WIN_BOTTOM - WIN_TOP);
  // 灰卷帘：只降下顶部约 1/5（帘体 32px + 底杆）
  const shadeH = 32;
  for (const seg of windowSegments()) {
    rect(ctx, seg[0] + 2, WIN_TOP, seg[1] - seg[0] - 4, shadeH, PAL.blindGrey);
    for (let ly = WIN_TOP + 4; ly < WIN_TOP + shadeH - 2; ly += 5) {
      rect(ctx, seg[0] + 2, ly, seg[1] - seg[0] - 4, 1, 'rgba(60,64,74,0.22)');
    }
    rect(ctx, seg[0] + 2, WIN_TOP + shadeH, seg[1] - seg[0] - 4, 4, PAL.blindEdge);
    rect(ctx, seg[0] + 2, WIN_TOP + shadeH, seg[1] - seg[0] - 4, 1, '#a8aeba');
    // 帘下投影落在玻璃上
    rect(ctx, seg[0] + 2, WIN_TOP + shadeH + 4, seg[1] - seg[0] - 4, 8, 'rgba(25,30,40,0.16)');
  }
  // 玻璃反光（竖向微斜亮带）
  for (const seg of windowSegments()) {
    const gx = seg[0] + Math.round((seg[1] - seg[0]) * 0.28);
    rect(ctx, gx, WIN_TOP + 44, 5, WIN_BOTTOM - WIN_TOP - 56, 'rgba(255,255,255,0.06)');
    rect(ctx, gx + 9, WIN_TOP + 52, 2, WIN_BOTTOM - WIN_TOP - 66, 'rgba(255,255,255,0.05)');
  }
  // 竖向细框（黑灰）
  for (const mx of [14, 146, 278, 410, 542, 674, 744, 768, 850, 866, 998, 1130, 1262]) {
    rect(ctx, mx, WIN_TOP - 4, 4, WIN_BOTTOM - WIN_TOP + 4, PAL.frameDark);
    rect(ctx, mx + 1, WIN_TOP - 4, 1, WIN_BOTTOM - WIN_TOP + 4, PAL.frameMid);
  }
  // 中横梃 + 底框（窗台）
  rect(ctx, x0, 130, w, 3, PAL.frameDark);
  rect(ctx, x0, 208, w, 4, PAL.frameDark);
  rect(ctx, x0, 212, w, 2, '#4a4f58');
  rect(ctx, x0, WIN_BOTTOM, w, 1, 'rgba(20,24,30,0.45)');
  // 窗底落在地毯上的投影
  rect(ctx, x0, WIN_BOTTOM + 1, w, 6, 'rgba(25,30,40,0.20)');
}

/** 窗墙分段（白柱 744–768 与玻璃隔断 850–866 之外的玻璃段） */
function windowSegments(): [number, number][] {
  return [
    [14, 146],
    [146, 278],
    [278, 410],
    [410, 542],
    [542, 674],
    [674, 744],
    [866, 998],
    [998, 1130],
    [1130, 1262],
  ];
}

/* ---------------- Z1 建筑骨架 ---------------- */

/** 白色裸顶：管线 + 横梁（悬吊 LED 灯体见 drawLedFixtures，灯带亮线在动态层） */
const LED_STRIPS: [number, number][] = [
  [150, 128],
  [330, 120],
  [530, 128],
  [710, 120],
  [960, 136],
  [1120, 128],
];

function drawCeiling(ctx: CanvasRenderingContext2D): void {
  rect(ctx, 0, 0, SCENE_W, CEIL_Y, PAL.ceilWhite);
  // 顶部细线管（浅灰）+ 接头盒
  rect(ctx, 0, 6, SCENE_W, 4, PAL.beamGrey);
  rect(ctx, 0, 6, SCENE_W, 1, PAL.beamLight);
  for (let x = 90; x < SCENE_W; x += 210) rect(ctx, x, 4, 10, 8, PAL.beamShade);
  // 横梁（垂直于镜头，浅灰白三面）
  for (let x = 24; x < SCENE_W; x += 152) {
    rect(ctx, x, 0, 12, CEIL_Y, PAL.beamGrey);
    rect(ctx, x, 0, 2, CEIL_Y, PAL.beamLight);
    rect(ctx, x + 10, 0, 2, CEIL_Y, PAL.beamShade);
  }
  // 裸顶拼缝
  for (let x = 0; x < SCENE_W; x += 160) rect(ctx, x, 24, 1, CEIL_Y - 24, 'rgba(90,96,108,0.28)');
  // 裸顶下沿阴影线
  rect(ctx, 0, CEIL_Y - 2, SCENE_W, 2, '#a8aeb9');
}

/** 悬吊 LED 条灯（吊杆 + 灯体外壳）：须画在窗墙之后，避免被顶部墙带与卷帘覆盖 */
function drawLedFixtures(ctx: CanvasRenderingContext2D): void {
  for (const [lx, lw] of LED_STRIPS) {
    rect(ctx, lx + 10, CEIL_Y - 2, 2, 24, PAL.frameMid);
    rect(ctx, lx + lw - 12, CEIL_Y - 2, 2, 24, PAL.frameMid);
    rect(ctx, lx, 58, lw, 7, '#dfe3e9');
    rect(ctx, lx, 58, lw, 1, '#eef0f3');
    rect(ctx, lx, 63, lw, 1, '#f4f6f8');
  }
}

/** 灰色地毯砖 + 夕阳窗光光斑 + 经理隔间抬高地台与台阶 */
function drawFloor(ctx: CanvasRenderingContext2D): void {
  // 地毯三条纵深色带（远亮近暗）
  rect(ctx, 0, FLOOR_TOP, SCENE_W, 50, PAL.carpetFar);
  rect(ctx, 0, FLOOR_TOP + 50, SCENE_W, 50, PAL.carpetMid);
  rect(ctx, 0, FLOOR_TOP + 100, SCENE_W, FLOOR_BOTTOM - FLOOR_TOP - 100, PAL.carpetNear);
  // 远端受窗光亮线
  rect(ctx, 0, FLOOR_TOP, SCENE_W, 1, 'rgba(240,200,150,0.16)');
  // 地毯砖透视网格：远密近疏 + 错缝
  const rows = [
    { y: FLOOR_TOP, h: 14, gap: 48, off: 0 },
    { y: FLOOR_TOP + 14, h: 18, gap: 60, off: 24 },
    { y: FLOOR_TOP + 32, h: 22, gap: 74, off: 10 },
    { y: FLOOR_TOP + 54, h: 26, gap: 90, off: 36 },
    { y: FLOOR_TOP + 80, h: 28, gap: 108, off: 14 },
    { y: FLOOR_TOP + 108, h: 32, gap: 128, off: 52 },
  ];
  for (const row of rows) {
    rect(ctx, 0, row.y, SCENE_W, 1, 'rgba(38,42,52,0.30)');
    for (let x = (row.off % row.gap) - row.gap; x < SCENE_W; x += row.gap) {
      rect(ctx, x, row.y, 1, row.h, 'rgba(38,42,52,0.26)');
    }
  }
  // 夕阳窗光斑（暖色平行四边形斜铺在地毯上）
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(240,175,110,0.12)';
  for (const [px, pw] of [[930, 300], [600, 240], [220, 220]] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(px + 30, FLOOR_TOP + 4);
    ctx.lineTo(px + pw, FLOOR_TOP + 4);
    ctx.lineTo(px + pw - 78, FLOOR_TOP + 62);
    ctx.lineTo(px - 48, FLOOR_TOP + 62);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // 经理隔间地台（抬高 28px，浅灰现代地台）
  rect(ctx, BOSS_STEP_X, BOSS_FLOOR_Y, SCENE_W - BOSS_STEP_X, FLOOR_BOTTOM - BOSS_FLOOR_Y, '#99a0ac');
  rect(ctx, BOSS_STEP_X, BOSS_FLOOR_Y, SCENE_W - BOSS_STEP_X, 1, '#c6cbd4');
  rect(ctx, BOSS_STEP_X, FLOOR_BOTTOM - 3, SCENE_W - BOSS_STEP_X, 3, '#6e7482');
  // 台面地毯延续（稍亮 + 一条砖缝）
  rect(ctx, BOSS_STEP_X + 4, BOSS_FLOOR_Y + 1, SCENE_W - BOSS_STEP_X - 8, 26, '#8b919d');
  rect(ctx, BOSS_STEP_X + 4, BOSS_FLOOR_Y + 13, SCENE_W - BOSS_STEP_X - 8, 1, 'rgba(38,42,52,0.22)');
  // 两级浅色台阶
  rect(ctx, BOSS_STEP_X, 326, 60, 14, '#9aa1ad');
  rect(ctx, BOSS_STEP_X, 326, 60, 2, '#a2a9b5');
  rect(ctx, BOSS_STEP_X + 58, 326, 2, 14, '#767c8a');
  rect(ctx, BOSS_STEP_X + 26, 312, 34, 14, '#a2a9b5');
  rect(ctx, BOSS_STEP_X + 26, 312, 34, 2, '#aab1bc');
  rect(ctx, BOSS_STEP_X + 58, 312, 2, 14, '#7e8492');
  // 桌下深灰地毯垫（隔间内）
  rect(ctx, 940, BOSS_FLOOR_Y + 2, 214, 22, '#6a7080');
  rect(ctx, 940, BOSS_FLOOR_Y + 2, 214, 1, '#7a8290');
  // 地毯前缘界线
  rect(ctx, 0, FLOOR_BOTTOM, SCENE_W, 2, 'rgba(19,20,26,0.4)');
}

/** 家具脚底投影：贴地暗带 + 左右淡出，让家具有重量 */
function shadowAt(ctx: CanvasRenderingContext2D, x: number, footY: number, w: number): void {
  rect(ctx, x + 3, footY - 3, w - 6, 3, 'rgba(19,20,26,0.32)');
  rect(ctx, x + 8, footY, w - 16, 2, 'rgba(19,20,26,0.18)');
}

function drawCutawayBase(ctx: CanvasRenderingContext2D): void {
  // 建筑剖面厚度：粗糙混凝土颗粒 + 双实线
  rect(ctx, 0, BASE_TOP, SCENE_W, VIEW_H - BASE_TOP, PAL.cutSolid);
  rect(ctx, 0, BASE_TOP, SCENE_W, 2, '#2c3038');
  rect(ctx, 0, VIEW_H - 6, SCENE_W, 2, '#2c3038');
  // 混凝土颗粒（确定性）
  for (let i = 0; i < 420; i += 1) {
    const gx = Math.round(hash01(i * 3.1) * SCENE_W);
    const gy = BASE_TOP + 4 + Math.round(hash01(i * 7.7) * (VIEW_H - BASE_TOP - 10));
    rect(ctx, gx, gy, 2, 1, i % 3 === 0 ? '#23262e' : '#1f222a');
  }
  // 剖面结构实线（双线）
  rect(ctx, 0, BASE_TOP + 6, SCENE_W, 1, PAL.cutLine);
  rect(ctx, 0, VIEW_H - 12, SCENE_W, 1, PAL.cutLine);
}

/* ---------------- Z2 家具静物（茶水/打印区） ---------------- */

/** 现代冷热饮水机（白机身 + 蓝桶） */
function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  const top = footY - 52;
  // 机身（白）
  rect(ctx, x, top + 16, 22, 36, '#dfe3e9');
  rect(ctx, x, top + 16, 22, 2, '#eef0f3');
  rect(ctx, x + 1, top + 46, 20, 6, '#c6cbd4');
  // 水桶（半透蓝）
  rect(ctx, x + 3, top, 16, 16, 'rgba(120,170,220,0.75)');
  rect(ctx, x + 5, top + 2, 12, 6, 'rgba(180,215,245,0.8)');
  // 出水嘴 + 接水盘
  rect(ctx, x + 5, top + 34, 4, 4, PAL.warnRed);
  rect(ctx, x + 13, top + 34, 4, 4, '#5f8fc0');
  rect(ctx, x + 2, top + 44, 18, 2, '#8b93a2');
  // 桶内气泡（静态基准点，动态层做上浮）
  rect(ctx, x + 7, top + 6, 2, 2, 'rgba(220,240,255,0.6)');
}

/** 白色水吧低柜（柜面热水壶 + 纸杯塔） */
function drawCredenza(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  const w = 78;
  // 柜体
  rect(ctx, x, footY - 66, w, 58, '#dfe3e9');
  rect(ctx, x + w - 4, footY - 66, 4, 58, PAL.colShade);
  // 双开门缝 + 黑拉手
  rect(ctx, x + Math.round(w / 2), footY - 62, 1, 50, '#b6bcc6');
  rect(ctx, x + Math.round(w / 2) - 6, footY - 40, 3, 2, PAL.frameDark);
  rect(ctx, x + Math.round(w / 2) + 4, footY - 40, 3, 2, PAL.frameDark);
  // 台面（白）
  rect(ctx, x - 2, footY - 72, w + 4, 7, '#eef0f3');
  rect(ctx, x - 2, footY - 66, w + 4, 2, PAL.colShade);
  // 黑细脚
  for (const fx of [x + 4, x + Math.round(w / 2) - 1, x + w - 8]) {
    rect(ctx, fx, footY - 8, 3, 8, PAL.frameDark);
  }
  // 柜面：电热水壶（白 + 黑把手）
  rect(ctx, x + 8, footY - 88, 14, 16, '#eef0f3');
  rect(ctx, x + 8, footY - 88, 14, 3, '#dfe3e9');
  rect(ctx, x + 7, footY - 92, 6, 4, PAL.frameMid);
  rect(ctx, x + 22, footY - 84, 2, 8, PAL.frameDark);
  rect(ctx, x + 11, footY - 91, 8, 2, PAL.frameMid);
  // 柜面：纸杯塔
  rect(ctx, x + 38, footY - 84, 10, 12, PAL.paperWhite);
  rect(ctx, x + 39, footY - 79, 8, 1, '#d8d0bc');
  rect(ctx, x + 40, footY - 88, 8, 4, '#f4f1e8');
}

/** 窗边纸箱 + 产品盒堆（生活气息） */
function drawCardboardBoxes(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  // 大箱
  rect(ctx, x, footY - 24, 26, 24, '#a5825e');
  rect(ctx, x, footY - 24, 26, 3, '#bd9a72');
  rect(ctx, x + 3, footY - 16, 20, 1, '#7c5f43');
  // 上层小箱
  rect(ctx, x + 3, footY - 38, 20, 14, '#b08d67');
  rect(ctx, x + 3, footY - 38, 20, 2, '#c9a878');
  // 白产品盒 + 橙标
  rect(ctx, x + 5, footY - 47, 13, 9, '#eef0f3');
  rect(ctx, x + 7, footY - 44, 9, 2, '#c14a2e');
  // 箱上贴纸
  rect(ctx, x + 16, footY - 20, 7, 5, PAL.paperWhite);
}

/** 白灰现代打印机（进纸仓 + 出纸口 + 顶部废稿堆） */
function drawPrinter(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  const top = footY - 40;
  // 机身
  rect(ctx, x, top + 12, 56, 28, '#c6cbd4');
  rect(ctx, x, top + 12, 56, 3, '#eef0f3');
  rect(ctx, x + 2, top + 38, 52, 4, '#a8aeb9');
  // 进纸仓
  rect(ctx, x + 6, top + 18, 44, 10, '#a8aeb9');
  rect(ctx, x + 10, top + 20, 36, 2, '#8b93a2');
  // 出纸口 + 卡住的纸
  rect(ctx, x + 8, top + 32, 40, 3, '#7c8290');
  rect(ctx, x + 14, top + 29, 22, 4, PAL.paperWhite);
  rect(ctx, x + 16, top + 27, 12, 3, '#dcd5c4');
  // 顶部堆叠废稿
  rect(ctx, x + 6, top + 4, 30, 8, PAL.paperWhite);
  rect(ctx, x + 10, top - 2, 26, 7, '#e4ddcc');
  // 状态灯基座（红灯闪烁在动态层）
  rect(ctx, x + 44, top + 6, 4, 4, '#3a3f4a');
}

/** 浅木样品架（三层小格 + 产品盒与 X1 小样） */
function drawSampleRack(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  const w = 36;
  const top = footY - 74;
  // 侧板 + 层板（浅木）
  rect(ctx, x, top, 4, footY - top, PAL.woodMild);
  rect(ctx, x + w - 4, top, 4, footY - top, PAL.woodMild);
  rect(ctx, x, top, w, 3, '#d8bc94');
  for (const sy of [top + 26, top + 50]) rect(ctx, x, sy, w, 4, PAL.woodMild);
  rect(ctx, x + 4, top + 3, w - 8, footY - top - 3, PAL.woodMildDark);
  // 层内产品盒（白 / 灰 / 橙）
  rect(ctx, x + 7, top + 14, 9, 9, '#eef0f3');
  rect(ctx, x + 9, top + 16, 5, 2, '#c14a2e');
  rect(ctx, x + 19, top + 12, 11, 11, '#dfe3e9');
  rect(ctx, x + 8, top + 38, 11, 9, '#dfe3e9');
  rect(ctx, x + 22, top + 36, 8, 11, '#eef0f3');
  // 底层小相机样机
  rect(ctx, x + 8, top + 62, 12, 8, '#1f232c');
  rect(ctx, x + 10, top + 64, 5, 4, PAL.screenGlow);
}

/* ---------------- Z2 家具静物（玩家工位区） ---------------- */

/** 白色长桌（白顶面 + 灰前缘 + 白钢矩腿 + 桌面两端低隔板） */
function drawWorkDesk(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  const deskTop = DESK_TOP_Y;
  const w = 252;
  // 桌板（白）
  rect(ctx, x, deskTop, w, 1, '#f6f8fa');
  rect(ctx, x, deskTop + 1, w, 5, '#eef0f3');
  rect(ctx, x, deskTop + 6, w, 2, PAL.colShade);
  rect(ctx, x, deskTop + 8, w, 1, '#b6bcc6');
  // 白钢矩腿（左亮右暗交代受光）
  for (const lx of [x + 6, x + w - 14]) {
    rect(ctx, lx, deskTop + 9, 8, footY - deskTop - 9, PAL.colShade);
    rect(ctx, lx, deskTop + 9, 1, footY - deskTop - 9, '#eef0f3');
    rect(ctx, lx + 7, deskTop + 9, 1, footY - deskTop - 9, PAL.colDark);
  }
  // 桌下后横撑
  rect(ctx, x + 14, footY - 28, w - 28, 4, PAL.colShade);
  // 桌下主机箱与线缆
  rect(ctx, x + w - 50, footY - 34, 26, 34, '#24272e');
  rect(ctx, x + w - 47, footY - 30, 4, 4, PAL.screenGlow);
  rect(ctx, x + 12, footY - 8, 40, 2, '#22252e');
  rect(ctx, x + 20, footY - 5, 60, 2, '#2c313c');
  // 桌面两端低隔板（成排长桌的分区感）
  for (const dx of [x, x + w - 8]) {
    rect(ctx, dx, deskTop - 28, 6, 28, PAL.colShade);
    rect(ctx, dx, deskTop - 28, 6, 2, '#dfe3e9');
    rect(ctx, dx + 5, deskTop - 28, 1, 28, PAL.colDark);
  }
  // 左隔板上的黄便签
  rect(ctx, x + 1, deskTop - 22, 10, 10, '#f4d35e');
  rect(ctx, x + 3, deskTop - 18, 6, 1, 'rgba(0,0,0,0.22)');
}

function drawDualMonitors(ctx: CanvasRenderingContext2D, x: number, deskTop: number): void {
  // 双屏：主屏（线框图）+ 副屏（消息轰炸）
  const screens = [
    { sx: x, w: 76, main: true },
    { sx: x + 84, w: 62, main: false },
  ];
  for (const s of screens) {
    // 支架
    rect(ctx, s.sx + Math.round(s.w / 2) - 4, deskTop - 12, 8, 10, '#3a3f4a');
    rect(ctx, s.sx + Math.round(s.w / 2) - 10, deskTop - 3, 20, 3, '#2c313c');
    // 边框（现代窄边黑）
    rect(ctx, s.sx, deskTop - 46, s.w, 36, '#1b1e24');
    // 屏面（底色动态层叠光）
    rect(ctx, s.sx + 2, deskTop - 44, s.w - 4, 32, s.main ? '#12202e' : '#101820');
    if (s.main) {
      // 主屏：落地页线框（白线 + 品牌橙块）
      rect(ctx, s.sx + 6, deskTop - 40, s.w - 12, 2, '#3f5871');
      rect(ctx, s.sx + 6, deskTop - 34, 18, 12, '#1d3247');
      rect(ctx, s.sx + 8, deskTop - 32, 6, 5, PAL.gold);
      rect(ctx, s.sx + 28, deskTop - 34, s.w - 38, 3, '#3f5871');
      rect(ctx, s.sx + 28, deskTop - 29, s.w - 44, 2, '#2c4258');
      rect(ctx, s.sx + 28, deskTop - 25, s.w - 44, 2, '#2c4258');
      rect(ctx, s.sx + s.w - 24, deskTop - 19, 18, 6, '#c14a2e');
    } else {
      // 副屏：未读消息红点排
      for (let i = 0; i < 5; i += 1) {
        rect(ctx, s.sx + 6, deskTop - 41 + i * 6, s.w - 16, 4, '#1c2733');
        rect(ctx, s.sx + s.w - 9, deskTop - 41 + i * 6, 3, 3, PAL.warnRed);
      }
    }
  }
  // 键盘 + 鼠标
  rect(ctx, x + 34, deskTop - 2, 44, 6, '#3a3f4a');
  for (let kx = 0; kx < 40; kx += 5) rect(ctx, x + 36 + kx, deskTop, 3, 2, '#4b5260');
  rect(ctx, x + 82, deskTop - 2, 6, 5, '#3a3f4a');
}

function drawCoffeeCups(ctx: CanvasRenderingContext2D, x: number, deskTop: number): void {
  // 两只外卖纸杯（蒸汽在动态层）
  rect(ctx, x, deskTop - 12, 9, 12, PAL.paperWhite);
  rect(ctx, x + 1, deskTop - 12, 7, 2, '#d8d0bc');
  rect(ctx, x + 13, deskTop - 10, 8, 10, '#e4ddcc');
  rect(ctx, x + 14, deskTop - 10, 6, 2, '#c9c0aa');
  // 杯套Logo
  rect(ctx, x + 2, deskTop - 7, 5, 3, '#c14a2e');
}

/** 桌面小物：笔筒 + 便签本（替代旧琥珀台灯） */
function drawDeskClutter(ctx: CanvasRenderingContext2D, x: number, deskTop: number): void {
  // 笔筒（灰）+ 两支笔
  rect(ctx, x, deskTop - 9, 8, 9, '#8b93a2');
  rect(ctx, x, deskTop - 9, 8, 2, '#a8aeba');
  rect(ctx, x + 1, deskTop - 15, 2, 6, PAL.warnRed);
  rect(ctx, x + 4, deskTop - 13, 2, 4, '#3e6953');
  // 便签本 + 橙便签
  rect(ctx, x + 12, deskTop - 5, 14, 5, PAL.paperWhite);
  rect(ctx, x + 12, deskTop - 6, 14, 1, '#d8d0bc');
  rect(ctx, x + 16, deskTop - 11, 8, 6, '#ee964b');
  rect(ctx, x + 18, deskTop - 8, 4, 1, 'rgba(0,0,0,0.22)');
}

/** 灰网面黑框人体工学椅（明显头枕 + 腰撑 + 五爪脚轮） */
function drawErgonomicChair(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  const seatY = footY - 58;
  // 头枕（黑框灰网）
  rect(ctx, x - 16, seatY - 86, 20, 10, PAL.chairFrame);
  rect(ctx, x - 14, seatY - 84, 16, 6, PAL.chairMeshLit);
  // 背部支撑杆
  rect(ctx, x - 8, seatY - 78, 4, 46, PAL.chairFrame);
  // 高背网面（黑框 + 灰网 + 网纹）
  rect(ctx, x - 18, seatY - 72, 14, 48, PAL.chairFrame);
  rect(ctx, x - 16, seatY - 70, 10, 44, PAL.chairMesh);
  for (let wy = seatY - 64; wy < seatY - 26; wy += 6) {
    rect(ctx, x - 16, wy, 10, 1, 'rgba(44,48,56,0.35)');
  }
  // 腰撑亮条
  rect(ctx, x - 16, seatY - 30, 10, 5, PAL.chairMeshLit);
  // 坐垫
  rect(ctx, x + 2, seatY, 26, 7, PAL.chairMesh);
  rect(ctx, x + 2, seatY + 6, 26, 2, PAL.chairFrame);
  // 扶手（黑框支杆 + 灰垫）
  rect(ctx, x - 12, seatY - 5, 12, 3, PAL.chairFrame);
  rect(ctx, x - 9, seatY - 3, 3, 6, PAL.chairFrame);
  // 气杆 + 五爪 + 脚轮
  rect(ctx, x + 13, seatY + 8, 4, 12, PAL.chairFrame);
  rect(ctx, x + 2, seatY + 20, 26, 3, PAL.chairFrame);
  rect(ctx, x - 3, seatY + 21, 8, 3, PAL.chairFrame);
  rect(ctx, x + 24, seatY + 21, 8, 3, PAL.chairFrame);
  rect(ctx, x - 3, seatY + 23, 3, 3, '#1b1e24');
  rect(ctx, x + 12, seatY + 23, 3, 3, '#1b1e24');
  rect(ctx, x + 28, seatY + 23, 3, 3, '#1b1e24');
}

/** 石影 X1 样机亚克力立架（金属高光粒子在动态层） */
function drawX1Stand(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  rect(ctx, x, footY - 40, 3, 40, 'rgba(220,229,242,0.5)');
  rect(ctx, x + 20, footY - 40, 3, 40, 'rgba(220,229,242,0.5)');
  rect(ctx, x, footY - 4, 23, 4, 'rgba(180,195,215,0.55)');
  // 小相机本体
  rect(ctx, x + 4, footY - 34, 15, 11, '#1f232c');
  rect(ctx, x + 6, footY - 32, 6, 6, '#3a4252');
  rect(ctx, x + 7, footY - 31, 4, 4, PAL.screenGlow);
  rect(ctx, x + 15, footY - 33, 2, 2, PAL.warnRed);
}

/** 长条白色花槽 + 丰富绿叶（现代办公标配绿植） */
function drawPlantTrough(ctx: CanvasRenderingContext2D, x: number, footY: number): void {
  const w = 46;
  // 槽体（白 + 前缘灰）
  rect(ctx, x, footY - 24, w, 24, PAL.troughWhite);
  rect(ctx, x, footY - 24, w, 2, '#eef0f3');
  rect(ctx, x, footY - 6, w, 3, PAL.colShade);
  rect(ctx, x, footY - 3, w, 3, '#b6bcc6');
  // 土面
  rect(ctx, x + 2, footY - 24, w - 4, 4, '#4a3a30');
  // 叶簇（三阶绿 + 高光顶叶）
  const tuft = (tx: number, ty: number, tw: number, th: number) => {
    rect(ctx, tx, ty, tw, th, PAL.plantLeaf);
    rect(ctx, tx + 2, ty - 3, tw - 4, 4, PAL.leafLight);
    rect(ctx, tx + 1, ty + th - 4, tw - 2, 4, PAL.leafDeep);
    rect(ctx, tx - 2, ty + 3, 3, th - 6, PAL.leafDeep);
    rect(ctx, tx + tw - 1, ty + 4, 3, th - 8, PAL.plantLeaf);
  };
  tuft(x + 2, footY - 46, 14, 22);
  tuft(x + 15, footY - 54, 16, 30);
  tuft(x + 28, footY - 44, 14, 20);
}

/** 背景成排工位（约 0.7 尺度）：白长桌 + 显示器背板 + 灰网黑框带头枕椅，与前景主桌形成两排 */
function drawBackWorkRow(ctx: CanvasRenderingContext2D): void {
  const x = 348;
  const w = 364;
  const deskTop = 205;
  const footY = 260;
  // 落影（远景更淡）
  rect(ctx, x + 4, footY - 3, w - 8, 3, 'rgba(19,20,26,0.20)');
  rect(ctx, x + 10, footY, w - 20, 2, 'rgba(19,20,26,0.12)');
  // 白长桌（白顶面 + 灰前缘 + 细矩腿 + 后横撑）
  rect(ctx, x, deskTop, w, 1, '#f0f3f6');
  rect(ctx, x, deskTop + 1, w, 4, '#e2e6eb');
  rect(ctx, x, deskTop + 5, w, 1, '#b9bfca');
  for (const lx of [x + 8, x + Math.round(w / 2) - 2, x + w - 13]) {
    rect(ctx, lx, deskTop + 6, 5, footY - deskTop - 6, '#c0c6d0');
    rect(ctx, lx + 4, deskTop + 6, 1, footY - deskTop - 6, '#9aa0ab');
  }
  rect(ctx, x + 16, footY - 12, w - 32, 3, '#ccd1d9');
  // 桌上显示器（背板朝镜头，屏朝椅子，椅背再压前一层）
  for (const mx of [400, 516, 632]) {
    rect(ctx, mx - 15, 182, 30, 21, '#262b34');
    rect(ctx, mx - 13, 184, 26, 17, '#1d222b');
    rect(ctx, mx - 2, 203, 4, 2, '#3a3f4a');
    rect(ctx, mx - 9, 203, 18, 2, '#31353d');
    rect(ctx, mx + 9, 198, 2, 2, PAL.screenGlow);
  }
  // 灰网面黑框人体工学椅（带头枕，约 0.7 尺度，背对镜头）
  for (const cx of [404, 520, 636]) {
    const seatY = 218;
    rect(ctx, cx - 7, seatY - 60, 14, 7, PAL.chairFrame); // 头枕
    rect(ctx, cx - 5, seatY - 58, 10, 4, PAL.chairMeshLit);
    rect(ctx, cx - 2, seatY - 53, 4, 13, PAL.chairFrame); // 背部支撑杆
    rect(ctx, cx - 9, seatY - 50, 13, 34, PAL.chairFrame); // 高背黑框
    rect(ctx, cx - 7, seatY - 48, 9, 30, PAL.chairMesh); // 灰网
    for (let wy = seatY - 44; wy < seatY - 22; wy += 5) {
      rect(ctx, cx - 7, wy, 9, 1, 'rgba(44,48,56,0.35)');
    }
    rect(ctx, cx - 7, seatY - 22, 9, 4, PAL.chairMeshLit); // 腰撑亮条
    rect(ctx, cx - 1, seatY, 19, 5, PAL.chairMesh); // 坐垫
    rect(ctx, cx - 1, seatY + 4, 19, 2, PAL.chairFrame);
    rect(ctx, cx + 6, seatY + 6, 3, 9, PAL.chairFrame); // 气杆
    rect(ctx, cx - 3, seatY + 14, 20, 2, PAL.chairFrame); // 五爪
    rect(ctx, cx - 3, seatY + 16, 3, 2, '#1b1e24');
    rect(ctx, cx + 13, seatY + 16, 3, 2, '#1b1e24');
  }
}

/** 白色方柱 + 黑色挂屏 + 浅木开放格（背景结构家具） */
function drawColumnUnit(ctx: CanvasRenderingContext2D): void {
  // 白方柱（顶天立地，左受光右背光）
  rect(ctx, 744, CEIL_Y, 24, 289, PAL.colShade);
  rect(ctx, 744, CEIL_Y, 3, 289, '#f6f8fa');
  rect(ctx, 764, CEIL_Y, 4, 289, PAL.colDark);
  rect(ctx, 744, CEIL_Y, 24, 3, PAL.colDark);
  // 柱础
  rect(ctx, 742, 322, 28, 9, '#b6bcc6');
  rect(ctx, 742, 329, 28, 2, '#8e95a1');
  // 黑色挂屏（柱正面，毡板别着白纸）
  rect(ctx, 748, 96, 16, 58, '#24272e');
  rect(ctx, 748, 96, 16, 1, '#3a3f4a');
  rect(ctx, 750, 104, 8, 11, PAL.paperWhite);
  rect(ctx, 751, 106, 5, 1, '#8b93a2');
  rect(ctx, 753, 109, 4, 1, '#8b93a2');
  rect(ctx, 750, 122, 8, 10, '#f4d35e');
  rect(ctx, 752, 125, 4, 1, 'rgba(0,0,0,0.22)');
  // 浅木开放格（三层，格内置物）
  const gx = 772;
  rect(ctx, gx, 208, 28, 123, PAL.woodMildDark);
  rect(ctx, gx, 208, 28, 4, PAL.woodMild);
  rect(ctx, gx, 204, 28, 4, '#d8bc94');
  rect(ctx, gx, 250, 28, 4, PAL.woodMild);
  rect(ctx, gx, 292, 28, 4, PAL.woodMild);
  rect(ctx, gx, 328, 28, 3, PAL.woodMildDark);
  // 层内置物：白收纳盒 / 灰书 / 小盆栽 / 橙书
  rect(ctx, gx + 4, 216, 10, 10, '#eef0f3');
  rect(ctx, gx + 4, 216, 10, 2, '#dfe3e9');
  rect(ctx, gx + 16, 218, 8, 8, '#8b93a2');
  rect(ctx, gx + 18, 224, 4, 2, '#545d6e');
  rect(ctx, gx + 5, 240, 8, 10, '#c14a2e');
  rect(ctx, gx + 14, 242, 7, 8, '#545d6e');
  rect(ctx, gx + 22, 238, 4, 12, '#3e6953');
  rect(ctx, gx + 21, 234, 6, 4, PAL.leafLight);
  rect(ctx, gx + 4, 300, 20, 12, '#eef0f3');
  rect(ctx, gx + 4, 300, 20, 2, '#dfe3e9');
  rect(ctx, gx + 8, 304, 3, 2, PAL.frameDark);
  // 开放格落影
  shadowAt(ctx, gx - 2, 331, 32);
}

/* ---------------- Z2 家具静物（经理玻璃隔间） ---------------- */

/** 玻璃隔断（黑框 + 极淡玻璃 + 门把手）：同一办公室内的经理隔间 */
function drawBossGlass(ctx: CanvasRenderingContext2D): void {
  // 左右竖框（从裸顶到地台）
  rect(ctx, 850, CEIL_Y, 4, BOSS_FLOOR_Y - CEIL_Y, PAL.frameDark);
  rect(ctx, 862, CEIL_Y, 4, BOSS_FLOOR_Y - CEIL_Y, PAL.frameDark);
  // 玻璃（极淡，不遮角色）
  rect(ctx, 854, CEIL_Y, 8, BOSS_FLOOR_Y - CEIL_Y, 'rgba(205,220,240,0.14)');
  // 横梃
  rect(ctx, 850, 108, 16, 3, PAL.frameDark);
  rect(ctx, 850, 208, 16, 3, PAL.frameDark);
  // 顶底连接件
  rect(ctx, 848, CEIL_Y, 20, 4, PAL.frameDark);
  rect(ctx, 848, BOSS_FLOOR_Y - 8, 20, 8, PAL.frameDark);
  // 玻璃斜高光
  rect(ctx, 855, 60, 2, 42, 'rgba(255,255,255,0.10)');
  rect(ctx, 858, 150, 2, 46, 'rgba(255,255,255,0.08)');
  // 门把手
  rect(ctx, 857, 236, 3, 10, '#1b1e24');
}

/** 隔间内黑色展示屏（X1 极简线稿 + 夕阳反光） */
function drawDisplayScreen(ctx: CanvasRenderingContext2D): void {
  // 贴墙细杆
  rect(ctx, 1166, 84, 2, 108, '#3a3f4a');
  rect(ctx, 1236, 84, 2, 108, '#3a3f4a');
  // 屏体（黑）
  rect(ctx, 1160, 84, 84, 108, '#2e3238');
  rect(ctx, 1164, 88, 76, 100, '#14171d');
  // 屏面：X1 极简线稿
  const ink = 'rgba(220,228,240,0.55)';
  rect(ctx, 1186, 104, 32, 22, ink);
  rect(ctx, 1194, 110, 12, 10, 'rgba(120,150,185,0.4)');
  rect(ctx, 1197, 113, 6, 6, 'rgba(190,215,240,0.55)');
  rect(ctx, 1180, 100, 6, 4, ink);
  // 参数线排
  for (let i = 0; i < 3; i += 1) {
    rect(ctx, 1174, 138 + i * 10, 8, 2, '#c14a2e');
    rect(ctx, 1186, 139 + i * 10, 42, 1, 'rgba(180,190,205,0.3)');
  }
  rect(ctx, 1212, 166, 22, 8, 'rgba(193,74,46,0.85)');
  // 屏面左上夕阳反光
  rect(ctx, 1164, 88, 18, 3, 'rgba(255,255,255,0.06)');
  rect(ctx, 1164, 91, 9, 2, 'rgba(255,255,255,0.05)');
}

/** 经理现代白桌（白桌板 + 双侧抽屉柜 + 笔电/文件/保温杯） */
function drawBossDesk(ctx: CanvasRenderingContext2D): void {
  const x = 940;
  const top = BOSS_FLOOR_Y - 62;
  // 桌板（白）
  rect(ctx, x, top, 210, 1, '#f6f8fa');
  rect(ctx, x, top + 1, 210, 4, '#eef0f3');
  rect(ctx, x, top + 5, 210, 2, PAL.colShade);
  rect(ctx, x, top + 7, 210, 1, '#b6bcc6');
  // 左右白色抽屉柜腿
  for (const cx of [x + 6, x + 182]) {
    rect(ctx, cx, top + 8, 22, BOSS_FLOOR_Y - top - 8, '#dfe3e9');
    rect(ctx, cx, top + 8, 22, 2, '#eef0f3');
    rect(ctx, cx, top + 24, 22, 1, '#b6bcc6');
    rect(ctx, cx, top + 42, 22, 1, '#b6bcc6');
    rect(ctx, cx + 9, top + 15, 4, 2, PAL.frameDark);
    rect(ctx, cx + 9, top + 33, 4, 2, PAL.frameDark);
  }
  // 笔电（开盖朝右）
  rect(ctx, x + 26, top - 18, 22, 16, '#1b1e24');
  rect(ctx, x + 28, top - 16, 18, 12, '#12202e');
  rect(ctx, x + 30, top - 13, 8, 2, '#3f5871');
  rect(ctx, x + 30, top - 9, 12, 1, '#2c4258');
  rect(ctx, x + 24, top - 3, 30, 3, '#3a3f4a');
  // 文件堆
  rect(ctx, x + 80, top - 8, 34, 8, PAL.paperWhite);
  rect(ctx, x + 84, top - 13, 26, 6, '#e4ddcc');
  // 保温杯
  rect(ctx, x + 138, top - 14, 10, 14, '#3e6953');
  rect(ctx, x + 139, top - 16, 8, 3, '#c98050');
  rect(ctx, x + 141, top - 10, 5, 3, '#a3c9a8');
}

/** 经理高背网椅（黑框灰网 + 头枕，落地台面） */
function drawBossChair(ctx: CanvasRenderingContext2D): void {
  const x = 1168;
  const top = BOSS_FLOOR_Y - 126;
  // 头枕
  rect(ctx, x + 2, top, 22, 10, PAL.chairFrame);
  rect(ctx, x + 4, top + 2, 18, 6, PAL.chairMeshLit);
  // 背部支撑杆
  rect(ctx, x + 10, top + 10, 5, 54, PAL.chairFrame);
  // 高背（黑框灰网 + 网纹 + 腰撑）
  rect(ctx, x, top + 12, 28, 82, PAL.chairFrame);
  rect(ctx, x + 3, top + 15, 22, 76, PAL.chairMesh);
  for (let wy = top + 22; wy < top + 80; wy += 7) {
    rect(ctx, x + 3, wy, 22, 1, 'rgba(44,48,56,0.32)');
  }
  rect(ctx, x + 3, top + 62, 22, 6, PAL.chairMeshLit);
  // 坐垫
  rect(ctx, x - 4, top + 94, 36, 8, PAL.chairMesh);
  rect(ctx, x - 4, top + 100, 36, 2, PAL.chairFrame);
  // 气杆 + 五爪
  rect(ctx, x + 12, top + 102, 5, 8, PAL.chairFrame);
  rect(ctx, x - 2, top + 110, 34, 3, PAL.chairFrame);
  rect(ctx, x - 8, top + 108, 8, 3, PAL.chairFrame);
  rect(ctx, x + 30, top + 108, 8, 3, PAL.chairFrame);
  rect(ctx, x - 8, top + 111, 3, 2, '#1b1e24');
  rect(ctx, x + 13, top + 111, 3, 2, '#1b1e24');
  rect(ctx, x + 33, top + 111, 3, 2, '#1b1e24');
}

/* ---------------- 前景遮挡（Z4，画在角色之后） ---------------- */

/** 阶梯尖叶：底宽上窄、逐层侧倾的像素叶轮廓 */
function leafSpike(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  w: number,
  h: number,
  lean: number,
  color: string,
): void {
  for (let i = 0; i < 4; i += 1) {
    const sw = Math.max(2, w - Math.round((w * i) / 4));
    const yTop = baseY - Math.round((h * (i + 1)) / 4);
    const yBot = baseY - Math.round((h * i) / 4);
    rect(ctx, baseX + Math.round((lean * i) / 4) - Math.round(sw / 2), yTop, sw, yBot - yTop + 1, color);
  }
}

/** 成簇尖叶：几组宽叶与细长深绿叶交错 + 受光亮叶尖（三阶绿、高低错落） */
function leafCluster(ctx: CanvasRenderingContext2D, cx: number, baseY: number, tall: number): void {
  leafSpike(ctx, cx - 7, baseY + 2, 9, tall, -2, PAL.plantLeaf);
  leafSpike(ctx, cx + 6, baseY + 3, 8, tall - 4, 2, PAL.plantLeaf);
  leafSpike(ctx, cx - 13, baseY + 1, 4, tall + 3, -3, PAL.leafDeep);
  leafSpike(ctx, cx - 1, baseY - 1, 4, tall + 7, -1, PAL.leafDeep);
  leafSpike(ctx, cx + 12, baseY + 2, 4, tall + 5, 3, PAL.leafDeep);
  leafSpike(ctx, cx + 2, baseY + 4, 6, Math.round(tall * 0.55), 1, PAL.leafLight);
}

/** 前景白色花槽 + 成簇尖叶绿植（局部遮挡地毯与基座，不遮角色）+ 散落纸张 */
function drawForeground(ctx: CanvasRenderingContext2D): void {
  // 左段花槽（工位前沿；叶顶只到脚踝，保持角色完整清楚）
  rect(ctx, 300, 350, 170, 4, '#4a3a30');
  leafCluster(ctx, 318, 352, 20);
  leafCluster(ctx, 350, 351, 26);
  leafCluster(ctx, 384, 352, 22);
  leafCluster(ctx, 414, 351, 28);
  leafCluster(ctx, 446, 352, 21);
  rect(ctx, 300, 354, 170, 26, PAL.troughWhite);
  rect(ctx, 300, 354, 170, 2, '#eef0f3');
  rect(ctx, 300, 372, 170, 3, PAL.colShade);
  rect(ctx, 300, 375, 170, 5, '#b6bcc6');
  // 右段花槽（隔间前沿，玩家不经过，叶簇更舒展）
  rect(ctx, 1010, 348, 150, 4, '#4a3a30');
  leafCluster(ctx, 1030, 350, 28);
  leafCluster(ctx, 1064, 349, 34);
  leafCluster(ctx, 1096, 350, 30);
  leafCluster(ctx, 1128, 349, 33);
  rect(ctx, 1010, 352, 150, 26, PAL.troughWhite);
  rect(ctx, 1010, 352, 150, 2, '#eef0f3');
  rect(ctx, 1010, 370, 150, 3, PAL.colShade);
  rect(ctx, 1010, 373, 150, 5, '#b6bcc6');
  // 贴基座散落废稿剪影
  rect(ctx, 176, 346, 26, 7, 'rgba(237,230,214,0.5)');
  rect(ctx, 556, 350, 22, 6, 'rgba(237,230,214,0.42)');
  rect(ctx, 905, 348, 20, 6, 'rgba(237,230,214,0.38)');
}

/* ---------------- 静态层组装 ---------------- */

/** 构建整幅静态背景（Z0–Z2），缓存复用 */
export function buildStaticBackground(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  drawCeiling(ctx);
  drawFloor(ctx);
  drawWindowWall(ctx);
  // LED 灯体在窗墙之后落位：吊杆与灯体不再被顶部墙带/卷帘盖住（动态 glow 锚点不变）
  drawLedFixtures(ctx);
  drawCutawayBase(ctx);

  // 背景结构：白柱 + 挂屏 + 开放格；经理玻璃隔断 + 黑色展示屏
  drawColumnUnit(ctx);
  drawBossGlass(ctx);
  drawDisplayScreen(ctx);

  // 茶水/打印区（家具先投影后落位）
  shadowAt(ctx, 44, 330, 24);
  drawWaterCooler(ctx, 46, 330);
  shadowAt(ctx, 72, 330, 84);
  drawCredenza(ctx, 74, 330);
  shadowAt(ctx, 148, 332, 28);
  drawCardboardBoxes(ctx, 150, 332);
  shadowAt(ctx, 174, 334, 58);
  drawPrinter(ctx, 176, 334);
  shadowAt(ctx, 244, 332, 38);
  drawSampleRack(ctx, 246, 332);
  shadowAt(ctx, 286, 332, 32);
  drawCardboardBoxes(ctx, 288, 332);

  // 背景成排工位（约 0.7 尺度，画在主桌之前 → 与前景主桌形成两排）
  drawBackWorkRow(ctx);

  // 工位区
  shadowAt(ctx, 394, 330, 256);
  drawWorkDesk(ctx, 396, 330);
  drawDualMonitors(ctx, 452, DESK_TOP_Y);
  drawCoffeeCups(ctx, 594, DESK_TOP_Y);
  drawDeskClutter(ctx, 612, DESK_TOP_Y);
  drawErgonomicChair(ctx, 448, 331);
  shadowAt(ctx, 663, 331, 25);
  drawX1Stand(ctx, 665, 331);
  shadowAt(ctx, 688, 330, 48);
  drawPlantTrough(ctx, 690, 330);

  // 经理隔间
  shadowAt(ctx, 938, BOSS_FLOOR_Y, 214);
  drawBossDesk(ctx);
  drawBossChair(ctx);
  return canvas;
}

/* ---------------- 动态层 ---------------- */

export type SceneActorState = {
  playerX: number;
  playerDir: 1 | -1;
  playerPose: PlayerPose;
  playerHidden?: boolean;
  bossVisible: boolean;
  bossMood: BossMood;
  bossGlare?: boolean;
};

export type SceneFx = {
  /** 交稿判定特效：0 无 / 1 金光 / 2 驳回红闪 */
  verdictFx?: 0 | 1 | 2;
  /** 顶棚 LED 灯带骤暗（Boss 对峙） */
  dimLamps?: boolean;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; kind: 'smoke' | 'steam' | 'spark' | 'confetti' | 'gold' };

/** 粒子池：打印机烟 / 咖啡蒸汽 / 打字火星 / 判定纸屑金光 */
class ParticlePool {
  private items: Particle[] = [];
  spawn(p: Particle): void {
    if (this.items.length < 90) this.items.push(p);
  }
  update(dt: number): void {
    for (const p of this.items) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'confetti' ? 26 : -2) * dt;
      p.life -= dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }
  clear(): void {
    this.items = [];
  }
  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = a;
      if (p.kind === 'smoke') rect(ctx, p.x, p.y, 3, 3, '#545d6e');
      else if (p.kind === 'steam') rect(ctx, p.x, p.y, 2, 3, 'rgba(220,229,242,0.8)');
      else if (p.kind === 'spark') rect(ctx, p.x, p.y, 2, 2, PAL.gold);
      else if (p.kind === 'gold') rect(ctx, p.x, p.y, 2, 2, PAL.gold);
      else rect(ctx, p.x, p.y, 3, 3, PAL.paperWhite);
      ctx.globalAlpha = 1;
    }
  }
}

export type DynamicDrawOptions = {
  t: number; // 秒
  dt: number;
  cameraX: number;
  actors: SceneActorState;
  fx?: SceneFx;
  reduceMotion: boolean;
  mode: 'title' | 'office' | 'boss';
};

const CYCLE = (t: number, period: number, reduceMotion: boolean): number =>
  reduceMotion ? 0 : (t % period) / period;

/**
 * 每帧动态层：静态背景 → LED 灯带/屏幕光 → 角色 → 粒子 → 前景花槽 → 光影滤镜 → 暗角。
 * 粒子池由模块级单例持有（场景唯一）。
 */
const particles = new ParticlePool();
let lastSpawnAt = 0;

export function drawDynamicLayer(
  ctx: CanvasRenderingContext2D,
  bg: HTMLCanvasElement,
  opts: DynamicDrawOptions,
): void {
  const { t, dt, cameraX, actors, fx, reduceMotion, mode } = opts;
  ctx.imageSmoothingEnabled = false;
  // 静态背景
  ctx.drawImage(bg, -cameraX, 0);

  ctx.save();
  ctx.translate(-cameraX, 0);

  const blink = CYCLE(t, 1.1, reduceMotion);
  const breathe = CYCLE(t, 2.4, reduceMotion) > 0.5 ? 1 : 0;

  // --- 屏幕冷光（副屏红点呼吸） ---
  const redDot = blink > 0.5 || reduceMotion;
  rect(ctx, 452 + 84 + 53, DESK_TOP_Y - 41, 3, 3, redDot ? PAL.warnRed : '#7a2528');

  // --- 打印机卡纸红灯 ---
  if (blink > 0.4) rect(ctx, 176 + 44, 334 - 40 + 6, 4, 4, PAL.warnRed);

  // --- 工位双屏冷光微晕 ---
  const screenGlow = ctx.createRadialGradient(486, 224, 8, 486, 224, 84);
  screenGlow.addColorStop(0, 'rgba(130,185,255,0.10)');
  screenGlow.addColorStop(1, 'rgba(130,185,255,0)');
  ctx.fillStyle = screenGlow;
  ctx.fillRect(400, 160, 180, 140);

  // --- LED 灯带亮线 + 极淡冷光（对峙时骤暗） ---
  const ledAlpha = fx?.dimLamps ? 0.25 : 1;
  for (const [lx, lw] of LED_STRIPS) {
    rect(ctx, lx, 64, lw, 2, `rgba(240,246,252,${0.85 * ledAlpha})`);
    const glow = ctx.createRadialGradient(lx + lw / 2, 66, 8, lx + lw / 2, 66, 90);
    glow.addColorStop(0, `rgba(215,228,245,${0.06 * ledAlpha})`);
    glow.addColorStop(1, 'rgba(215,228,245,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lx - 40, 58, lw + 80, 120);
  }

  // --- 角色：雕茅经理（3 倍像素，隔间内桌前；boss 模式走到隔断前与玩家对峙） ---
  const BOSS_ANCHOR_W = 18 * ACTOR_SCALE;
  if (actors.bossVisible) {
    const bossCX = mode === 'boss' ? 930 : 955;
    const bossY = BOSS_FLOOR_Y - BOSS_SPRITE_H;
    drawBoss(ctx, bossCX - Math.round(BOSS_ANCHOR_W / 2), bossY, {
      mood: actors.bossMood,
      belly: breathe,
      glare: actors.bossGlare,
      scale: ACTOR_SCALE,
    });
    // 雪茄（对峙模式下收起）
    if (mode !== 'boss') {
      rect(ctx, bossCX + 18, bossY + 20, 8, 3, '#8a5a3a');
      rect(ctx, bossCX + 26, bossY + 20, 2, 3, PAL.warnRed);
    }
  }

  // --- 角色：玩家（3 倍像素，脚底锚点固定；坐姿贴椅子手搭桌面） ---
  if (!actors.playerHidden) {
    const seated = actors.playerPose === 'type' || actors.playerPose === 'sleep';
    const py = seated ? SEAT_PY : PLAYER_FOOT_Y - PLAYER_SPRITE_H;
    const px = actors.playerX - 7 * ACTOR_SCALE;
    drawPlayer(ctx, px, py, {
      pose: actors.playerPose,
      dir: actors.playerDir,
      breathe,
      step: CYCLE(t, 0.32, reduceMotion) > 0.5 ? 1 : 0,
      scale: ACTOR_SCALE,
    });
    if (actors.playerPose === 'submit') {
      // 举起的发光图纸（双手上方）
      const dx = actors.playerX - 24;
      rect(ctx, dx, py - 34, 48, 30, PAL.paperWhite);
      rect(ctx, dx + 5, py - 28, 38, 3, '#8b93a2');
      rect(ctx, dx + 5, py - 22, 26, 3, '#8b93a2');
      rect(ctx, dx + 5, py - 16, 32, 3, '#c14a2e');
      rect(ctx, dx + 5, py - 10, 20, 3, '#8b93a2');
      if (!reduceMotion && blink > 0.5) rect(ctx, dx + 50, py - 36, 3, 3, PAL.gold);
    }
    if (actors.playerPose === 'sleep') {
      // Zzz 飘动（从头顶飘起）
      for (let i = 0; i < 3; i += 1) {
        const phase = reduceMotion ? 0 : (t * 0.5 + i * 0.33) % 1;
        drawZzz(ctx, actors.playerX + 18 + i * 8, py - 8 - phase * 22, 1 - phase);
      }
    }
  }

  // --- 粒子（reduceMotion 不生成） ---
  if (!reduceMotion) {
    lastSpawnAt += dt;
    if (lastSpawnAt > 0.14) {
      lastSpawnAt = 0;
      // 打印机烟
      particles.spawn({ x: 190 + Math.random() * 20, y: 296, vx: 0, vy: -9, life: 2.2, maxLife: 2.2, kind: 'smoke' });
      // 咖啡蒸汽
      if (Math.random() > 0.4) {
        particles.spawn({ x: 598 + Math.random() * 6, y: 228, vx: 1.5, vy: -12, life: 1.1, maxLife: 1.1, kind: 'steam' });
      }
      // 打字火星（键盘在桌面 242 附近）
      if (actors.playerPose === 'type') {
        particles.spawn({ x: actors.playerX + (actors.playerDir === 1 ? 18 : -6), y: 246, vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.4, maxLife: 0.4, kind: 'spark' });
      }
      // 经理雪茄烟（对峙模式下收起雪茄）
      if (actors.bossVisible && mode !== 'boss') {
        particles.spawn({ x: bossSmokeX(mode), y: BOSS_FLOOR_Y - 62, vx: 2, vy: -8, life: 2.6, maxLife: 2.6, kind: 'smoke' });
      }
    }
    particles.update(dt);
    particles.draw(ctx);
  }

  // --- 前景遮挡：白色花槽绿叶（只遮地毯/基座，角色完整清楚） ---
  drawForeground(ctx);

  ctx.restore();

  // --- Z5 光影滤镜（不随相机） ---
  ctx.save();
  ctx.translate(-cameraX, 0);
  // 夕阳斜切光束（从右侧窗群投向左侧地毯）
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(240,185,130,0.09)';
  for (let i = 0; i < 4; i += 1) {
    const sx = 760 + i * 72;
    ctx.beginPath();
    ctx.moveTo(sx, 178);
    ctx.lineTo(sx + 30, 178);
    ctx.lineTo(sx - 88, FLOOR_BOTTOM);
    ctx.lineTo(sx - 118, FLOOR_BOTTOM);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // 全局冷调混合（室内冷灰 × 窗外暖金）
  ctx.fillStyle = 'rgba(26,30,44,0.06)';
  ctx.fillRect(cameraX, 0, VIEW_W, VIEW_H);
  ctx.restore();

  // --- 暗角 vignette（Z4） ---
  const vig = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
  vig.addColorStop(0, 'rgba(19,20,26,0)');
  vig.addColorStop(1, 'rgba(19,20,26,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // --- 判定特效 ---
  if (fx?.verdictFx === 1) {
    // 过稿金光：中央金粒上升（一次性粒子在调用方塞入）
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(247,183,51,${0.10 + 0.06 * Math.sin(t * 9)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (fx?.verdictFx === 2) {
    // 驳回：全屏边缘红闪
    const flash = Math.sin(t * 14) > 0 ? 0.22 : 0.08;
    ctx.strokeStyle = `rgba(217,56,58,${flash})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, VIEW_W - 10, VIEW_H - 10);
  }
}

function bossSmokeX(mode: 'title' | 'office' | 'boss'): number {
  return (mode === 'boss' ? 930 : 955) + 28;
}

/** 判定瞬间的爆发粒子（过稿金光 / 驳回纸屑） */
export function burstVerdictParticles(kind: 'gold' | 'confetti'): void {
  for (let i = 0; i < 24; i += 1) {
    particles.spawn({
      x: VIEW_W / 2 + (Math.random() - 0.5) * 160,
      y: 200 + Math.random() * 60,
      vx: (Math.random() - 0.5) * (kind === 'gold' ? 40 : 70),
      vy: kind === 'gold' ? -50 - Math.random() * 40 : -20,
      life: kind === 'gold' ? 1.4 : 1.8,
      maxLife: kind === 'gold' ? 1.4 : 1.8,
      kind,
    });
  }
}

/** 清空粒子（切换场景/模式时防串场） */
export function clearParticles(): void {
  particles.clear();
}

/* ---------------- HUD 小件（画在视口，不随相机） ---------------- */

/** 热点指示：走近时脚下/头顶的交互提示框（画在画布内，供无 DOM 场景复用） */
export function drawHotspotBadge(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  hotspot: Hotspot,
  playerX: number,
  t: number,
  reduceMotion: boolean,
): void {
  const dist = Math.abs(playerX - hotspot.x);
  if (dist > hotspot.range) return;
  const bob = reduceMotion ? 0 : Math.round(Math.sin(t * 4) * 2);
  const bx = hotspot.x - cameraX;
  const by = PLAYER_FOOT_Y - PLAYER_SPRITE_H - 26 + bob;
  // 像素提示牌
  rect(ctx, bx - 34, by, 68, 14, 'rgba(19,20,26,0.88)');
  rect(ctx, bx - 34, by, 68, 1, PAL.gold);
  ctx.fillStyle = '#ede6d6';
  ctx.font = '9px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`E · ${hotspot.label}`, bx, by + 10);
  ctx.textAlign = 'left';
  // 热点脚下光圈
  ctx.globalAlpha = 0.5;
  rect(ctx, bx - 18, PLAYER_FOOT_Y + 2, 36, 3, PAL.gold);
  ctx.globalAlpha = 1;
}
