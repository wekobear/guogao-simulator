/**
 * 构建前同步美术资产 manifest（v0.3.0 fullscene）。
 *
 * 协调目录的 asset-manifest.json 由主 Agent 的资产生成器维护；
 * 这里在 vite build 前把它拷到 public/art/asset-manifest.json（只拷 metadata，
 * 不写任何 png——三张素材 png 由主 Agent 直接放入 public/art/）。
 * 协调目录暂无 manifest 时保留仓库内已有副本（若有），无副本则跳过，
 * 运行时回退到 src/components/office/artAssets.ts 的 DEFAULT_MANIFEST。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = '/Users/vicbear/Documents/ChatGPT/过稿模拟器/outputs/fullscene-assets/asset-manifest.json';
const DEST_DIR = fileURLToPath(new URL('../public/art/', import.meta.url));
const DEST = path.join(DEST_DIR, 'asset-manifest.json');

function sameContent() {
  if (!existsSync(DEST)) return false;
  try {
    return readFileSync(SRC, 'utf8') === readFileSync(DEST, 'utf8');
  } catch {
    return false;
  }
}

mkdirSync(DEST_DIR, { recursive: true });

if (!existsSync(SRC)) {
  if (existsSync(DEST)) {
    console.log('[sync-art] 协调目录暂无 manifest，保留 public/art/asset-manifest.json');
  } else {
    console.log('[sync-art] 协调目录暂无 manifest，跳过（运行时用内置默认值）');
  }
  process.exit(0);
}

if (sameContent()) {
  console.log('[sync-art] manifest 无变化');
  process.exit(0);
}

/**
 * 唯一转换点：协调目录形状（assets.office/player/boss）→ 运行时合同
 * （office/playerStrip/bossIdle）。角色对象整体保留（frameRegistration、
 * scaleReferenceVisibleHeightPx、solidPixelBounds、feetAnchors、facing 等），
 * 绘制层按这些字段裁剪定位；已是运行时形状则原样通过。
 */
function toRuntimeManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.office && typeof raw.office.width === 'number') return raw;
  const a = raw.assets;
  if (!a || !a.office || typeof a.office.width !== 'number') return null;
  return {
    office: a.office,
    playerStrip: a.player ?? undefined,
    bossIdle: a.boss ?? undefined,
  };
}

let parsed;
try {
  parsed = toRuntimeManifest(JSON.parse(readFileSync(SRC, 'utf8')));
} catch (err) {
  console.warn(`[sync-art] manifest 解析失败，保留现有副本：${err?.message ?? err}`);
  process.exit(0);
}
if (!parsed) {
  console.warn('[sync-art] manifest 形状不合法（缺 office 元数据），保留现有副本');
  process.exit(0);
}

writeFileSync(DEST, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`[sync-art] 已转换同步 manifest → public/art/asset-manifest.json (office ${parsed.office.width}x${parsed.office.height})`);

// 顺带校验：public/art 素材 png 是否到位，只提示不生成
for (const name of ['office-scene.png', 'player-strip.png', 'boss-idle.png']) {
  const p = path.join(DEST_DIR, name);
  console.log(`[sync-art] ${name}: ${existsSync(p) ? 'OK' : '缺失（等待主 Agent 生成）'}`);
}
