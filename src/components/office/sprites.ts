/**
 * 像素角色绘制：设计师打工人与雕茅经理。
 * 全部原创程序像素：字符串网格 → fillRect，1 字符 = scale 像素，'.' 为透明。
 * 舞台按 3 倍像素倍率绘制（人物约 78/84 逻辑像素高，脚底锚点固定），
 * 翻转用列反转实现，不做旋转缩放，保持硬像素。
 */

export type SpriteMap = Record<string, string>;

/** 逐字符绘制 sprite；flip 时按列反转（角色朝左）；scale 为像素倍率 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  map: SpriteMap,
  x: number,
  y: number,
  flip = false,
  scale = 1,
): void {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c += 1) {
      const ch = row[flip ? row.length - 1 - c : c]!;
      const color = map[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

/* ================= 玩家 · 设计师打工人（总高 26 行，×3 ≈ 78px） ================= */

const PLAYER_MAP: SpriteMap = {
  h: '#3a2a24', // 鸡窝乱发
  H: '#4d382f', // 乱发受光面
  s: '#e8b98f', // 皮肤
  e: '#13141a', // 死鱼眼
  m: '#c4886a', // 嘴
  k: '#c79a76', // 黑眼圈
  c: '#5a6f8a', // 洗脱色连帽衫
  C: '#475a70', // 连帽衫暗部
  w: '#ede6d6', // 帽衫抽绳
  R: '#c14a2e', // 工牌挂绳
  P: '#ede6d6', // 工牌底板
  Q: '#3f5871', // 工牌照片区
  j: '#4a5568', // 掉色牛仔裤
  f: '#d8d3c4', // 帆布鞋
  F: '#a8a294', // 鞋底
};

// 头 12×9：翘起的乱发 / 死鱼眼 + 黑眼圈 / 嘴与下颌
const PLAYER_HEAD = [
  '.h.hh..hh.h.',
  '.hhHhhhhhh..',
  'hhhhhhhhhhhh',
  '.hssssssssh.',
  '.hsessssesh.',
  '.skssssssks.',
  '..sssmmsss..',
  '...ssssss...',
  '....ssss....',
] as const;

// 躯干 14×10：连帽衫 + 抽绳 + 挂绳工牌（站立）
const PLAYER_BODY_IDLE = [
  '..CCCCCCCCCC..',
  '.CccccccccccC.',
  '.CcRwccccwRcC.',
  '.CcRccPPccRcC.',
  '.CcccPPQcccC..',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '.CccccccccccC.',
  'CsccccccccccsC',
  '.CCCCCCCCCCCC.',
] as const;

// 打字姿势 14×10：上身前倾，一只手伸向键盘（坐在工位椅上，腿被桌椅遮挡）
const PLAYER_BODY_TYPE = [
  '...CCCCCCCC...',
  '..CccccccccC..',
  '..CccccccccC..',
  '..Cccccccccss.',
  '..Ccccccccsss.',
  '...Ccccccccss.',
  '...Ccccccccc..',
  '....CCCCCCC...',
  '..............',
  '..............',
] as const;

// 送审姿势 14×10：双手举稿过头，发光图纸由场景层补画
const PLAYER_BODY_SUBMIT = [
  'CsCCCCCCCCCCsC',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '.CccccccccccC.',
  '..CCCCCCCCCC..',
] as const;

// 腿 10×7：站立 / 行走两帧（两脚交替内扣）
const PLAYER_LEGS_STAND = [
  '.jjj..jjj.',
  '.jjj..jjj.',
  '.jjj..jjj.',
  '.jjj..jjj.',
  '.jjj..jjj.',
  '.fff..fff.',
  '.FFF..FFF.',
] as const;

const PLAYER_LEGS_WALK_A = [
  '..jjj.jjj.',
  '..jjj.jjj.',
  '.jjj...jjj',
  '.jjj...jjj',
  '.jjj...jjj',
  '.fff...fff',
  'fff....fff',
] as const;

const PLAYER_LEGS_WALK_B = [
  '..jjjjjjj.',
  '..jjjjjjj.',
  '..jjj.jjj.',
  '..jjj.jjj.',
  '..jjj.jjj.',
  '..fff.fff.',
  '..FFF.FFF.',
] as const;

/** 玩家 sprite 总行数（头 9 + 身 10 + 腿 7），×scale 即逻辑高 */
export const PLAYER_SPRITE_ROWS = 26;

/** 测试辅助：全部 sprite 网格（校验行宽一致，防止手绘像素串行），见文件末尾 SPRITE_SHEETS */
export type PlayerPose = 'idle' | 'walk' | 'type' | 'submit' | 'sleep';

/**
 * 绘制玩家。头 9 行 + 身 10 行 + 腿 7 行 = 26 行；scale=3 时约 78 逻辑像素高。
 * breathe: 0/1 呼吸相位（肩部下沉 1 像素 × scale）；step: 0/1 行走帧。
 * (x, y) 是 sprite 左上角；调用方按脚底锚点换算。
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { pose: PlayerPose; dir: 1 | -1; breathe?: 0 | 1; step?: 0 | 1; scale?: number },
): void {
  const { pose, dir } = opts;
  const S = opts.scale ?? 1;
  const breathe = opts.breathe ?? 0;
  const step = opts.step ?? 0;
  const flip = dir === -1;
  const dy = (pose === 'sleep' ? 2 : breathe) * S;
  drawSprite(ctx, PLAYER_HEAD, PLAYER_MAP, x + S, y + dy, flip, S);
  let body: readonly string[] = PLAYER_BODY_IDLE;
  if (pose === 'type' || pose === 'sleep') body = PLAYER_BODY_TYPE;
  if (pose === 'submit') body = PLAYER_BODY_SUBMIT;
  drawSprite(ctx, body, PLAYER_MAP, x, y + 9 * S + dy, flip, S);
  if (pose !== 'type' && pose !== 'sleep') {
    const legs = pose === 'walk' ? (step === 0 ? PLAYER_LEGS_WALK_A : PLAYER_LEGS_WALK_B) : PLAYER_LEGS_STAND;
    drawSprite(ctx, legs, PLAYER_MAP, x + 2 * S, y + 19 * S, flip, S);
  }
}

/** 睡着的 z 字（3×3），飘动与透明度由调用方控制 */
const Z_SPRITE = ['ggg', 'g.g', 'ggg'] as const;
export function drawZzz(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  drawSprite(ctx, Z_SPRITE, { g: '#dce5f2' }, x, y);
  ctx.globalAlpha = 1;
}

/* ================= Boss · 雕茅经理（总高 28 行，×3 = 84px） ================= */

const BOSS_MAP: SpriteMap = {
  g: '#1d1d22', // 油亮大背头
  G: '#3a3a48', // 发高光
  s: '#e2ab86', // 皮肤
  e: '#13141a', // 眯眯眼
  l: '#f0e6c8', // 金丝眼镜
  w: '#ffffff', // 推镜反光帧
  n: '#c98f6e', // 双下巴阴影
  v: '#23242e', // 深色条纹西装
  V: '#2e3040', // 条纹亮线
  h: '#ede6d6', // 衬衫
  q: '#ede6d6', // 胸口方巾
  r: '#d9383a', // 领带
  b: '#1a1b24', // 西装暗部
  t: '#1a1a20', // 锃亮皮鞋
  T: '#545d6e', // 皮鞋反光点
};

// 头 12×9：大背头 + 金丝眼镜眯眯眼 + 双下巴
const BOSS_HEAD = [
  '..gggggggg..',
  '.gGgggggggg.',
  '.gggggggggg.',
  '.gssssssssg.',
  '.slelsslels.',
  '.ssssssssss.',
  '..snnssnns..',
  '..ssssssss..',
  '...ssssss...',
] as const;

// 推眼镜帧：镜框闪一道 45° 冷白高光、眯眼缩成线
const BOSS_HEAD_GLARE = [
  '..gggggggg..',
  '.gGgggggggg.',
  '.gggggggggg.',
  '.gssssssssg.',
  '.swkwsswkws.',
  '.ssssssssss.',
  '..snnssnns..',
  '..ssssssss..',
  '...ssssss...',
] as const;

// 躯干 18×13：紧绷条纹西装 + 领带 + 胸口方巾 + 圆滚啤酒肚
const BOSS_BODY = [
  '...vvvvvvvvvvvv...',
  '..vvvVvvvvvvVvvv..',
  '.vvvhhvvvvvvhhqvv.',
  '.vvvvhhrrrrhhvvvv.',
  '.vvvvvhrrrrhvvvvv.',
  '.vvvvvvrrrrvvvvvv.',
  '.vvvvvvvrrvvvvvvv.',
  '.vvvvvvvvvvvvvvvv.',
  'bvvvvvvvvvvvvvvvvb',
  'bvvvvvssssssvvvvvb',
  'bvvvvsvvvvvvsvvvvb',
  '.bvvvvvvvvvvvvvvb.',
  '..bb..........bb..',
] as const;

// 腿 10×6：西装裤 + 反光皮鞋
const BOSS_LEGS = [
  '.vvv..vvv.',
  '.vvv..vvv.',
  '.vvv..vvv.',
  '.ttt..ttt.',
  '.tTt..tTt.',
  '.ttt..ttt.',
] as const;

/** Boss sprite 总行数（头 9 + 身 13 + 腿 6），×scale 即逻辑高 */
export const BOSS_SPRITE_ROWS = 28;

export type BossMood = 'idle' | 'angry' | 'pleased';

/**
 * 绘制雕茅经理。头 9 行 + 身 13 行 + 腿 6 行 = 28 行；scale=3 时 84 逻辑像素高。
 * belly: 0/1 呼吸横向扩张；glare: 推眼镜冷光帧。
 * (x, y) 是 sprite 左上角（18 列宽的躯干框）。
 */
export function drawBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { mood: BossMood; belly?: 0 | 1; glare?: boolean; scale?: number },
): void {
  const belly = opts.belly ?? 0;
  const S = opts.scale ?? 1;
  drawSprite(ctx, opts.glare ? BOSS_HEAD_GLARE : BOSS_HEAD, BOSS_MAP, x + 3 * S, y, false, S);
  drawSprite(ctx, BOSS_BODY, BOSS_MAP, x - belly * S, y + 9 * S, false, S);
  if (belly === 1) {
    // 呼吸扩张：躯干两侧各补一列西装
    ctx.fillStyle = BOSS_MAP.v;
    ctx.fillRect(x - S, y + 14 * S, S, 5 * S);
    ctx.fillRect(x + 18 * S, y + 14 * S, S, 5 * S);
  }
  drawSprite(ctx, BOSS_LEGS, BOSS_MAP, x + 4 * S, y + 22 * S, false, S);
  if (opts.mood === 'angry') {
    // 怒气：眉心两颗红像素
    ctx.fillStyle = '#d9383a';
    ctx.fillRect(x + 5 * S, y + 4 * S, S, S);
    ctx.fillRect(x + 14 * S, y + 4 * S, S, S);
  }
}

/** 测试辅助：全部 sprite 网格（校验行宽一致，防止手绘像素串行） */
export const SPRITE_SHEETS: Record<string, readonly string[]> = {
  playerHead: PLAYER_HEAD,
  playerBodyIdle: PLAYER_BODY_IDLE,
  playerBodyType: PLAYER_BODY_TYPE,
  playerBodySubmit: PLAYER_BODY_SUBMIT,
  playerLegsStand: PLAYER_LEGS_STAND,
  playerLegsWalkA: PLAYER_LEGS_WALK_A,
  playerLegsWalkB: PLAYER_LEGS_WALK_B,
  bossHead: BOSS_HEAD,
  bossHeadGlare: BOSS_HEAD_GLARE,
  bossBody: BOSS_BODY,
  bossLegs: BOSS_LEGS,
};
