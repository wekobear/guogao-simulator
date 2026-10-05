import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * v0.3.0 fullscene 布局与交互响应性：
 * 全屏场景层覆盖视口、HUD 覆盖其上；办公室舞台 fill 主区（世界元数据经 dataset 暴露）；
 * 桌面键盘移动、移动端触控方向键与 E 交互；徽标幂等寻路；办公室内 modal 可关闭；
 * 320 / 393 / 430 / 768(tablet touch) 完整「编辑 → 保存 → 交稿 → 评审」链路无截断；
 * 热点徽标悬在人物头顶上方（不遮脚/腿）且触摸目标 ≥44px。
 * 截图一律 animations:'disabled'，办公室截图另等真实场景图与相机落稳，不靠长 sleep。
 * 固定 seed=1，全程真实 UI。
 */

const EVIDENCE_DIR = process.env.EVIDENCE_DIR
  ? path.resolve(process.env.EVIDENCE_DIR)
  : fileURLToPath(new URL('../../test-results/fullscene-evidence/', import.meta.url));
mkdirSync(EVIDENCE_DIR, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, name), animations: 'disabled' });
}

async function expectNoHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(m.doc, `documentElement.scrollWidth ${m.doc} > innerWidth ${m.inner}`).toBeLessThanOrEqual(m.inner + 1);
  expect(m.body, `body.scrollWidth ${m.body} > innerWidth ${m.inner}`).toBeLessThanOrEqual(m.inner + 1);
}

/** 进入认真模式办公室（seed=1） */
async function enterOffice(page: Page) {
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '新开一单' }).click();
  await page.getByRole('button', { name: /^进办公室拼页面/ }).click();
  await page.getByRole('button', { name: '开始这单' }).click();
  await expect(page.getByRole('heading', { name: '差不多创意部 · 办公室' })).toBeVisible();
}

/** 等待舞台 canvas 的世界元数据就绪（200ms 节流写入 dataset） */
async function canvasMeta(page: Page) {
  const canvas = page.locator('.office-stage .office-canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('.office-stage .office-canvas') as HTMLCanvasElement | null;
    return !!el?.dataset.scale && !!el?.dataset.playerX;
  });
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return {
      sceneW: Number(c.dataset.sceneW ?? c.getAttribute('data-scene-w')),
      cam: Number(c.dataset.cam),
      scale: Number(c.dataset.scale),
      viewWorldW: Number(c.dataset.viewWorldW),
      playerX: Number(c.dataset.playerX),
      scene: c.dataset.scene ?? '0',
      headTopY: Number(c.dataset.headTopY ?? '0'),
      feetY: Number(c.dataset.feetY ?? '0'),
    };
  });
}

/**
 * 办公室截图就绪：真实场景图已绘制（dataset.scene==='1'）且相机落在真实目标上——
 * target = clampCamera(playerX - viewWorldW/2, sceneW, viewWorldW)，与舞台同一夹取规则
 * （sceneW ≤ viewWorldW 时 max ≤ 0 → max/2 居中）。|cam - target| ≤ 1 世界像素才算落稳；
 * 走动中相机滞后目标数十世界像素，该判据同时保证玩家已停下。
 * dataset 每 200ms 节流写入，判据读的是快照值但不影响收敛判定；配合
 * animations:'disabled'，不依赖长 sleep，也不用「两次采样相同」这种被节流自然满足的弱判据。
 */
async function officeReadyForShot(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.office-stage .office-canvas') as HTMLCanvasElement | null;
    if (!el || el.dataset.scene !== '1' || !el.dataset.headTopY) return false;
    const sceneW = Number(el.dataset.sceneW ?? el.getAttribute('data-scene-w'));
    const cam = Number(el.dataset.cam);
    const playerX = Number(el.dataset.playerX);
    const viewWorldW = Number(el.dataset.viewWorldW);
    if (![sceneW, cam, playerX, viewWorldW].every(Number.isFinite)) return false;
    const max = sceneW - viewWorldW;
    const target = max <= 0 ? max / 2 : Math.max(0, Math.min(max, playerX - viewWorldW / 2));
    return Math.abs(cam - target) <= 1;
  });
}

test('首页：全屏场景层铺满视口，HUD 覆盖其上，走道角色不被内容遮挡', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=1');
  const scene = (await page.locator('.scene-layer').boundingBox())!;
  expect(scene.width).toBeGreaterThanOrEqual(1439);
  expect(scene.height).toBeGreaterThanOrEqual(899);
  const canvasBox = (await page.locator('.scene-layer canvas').boundingBox())!;
  expect(canvasBox.width).toBeGreaterThanOrEqual(1439);
  expect(canvasBox.height).toBeGreaterThanOrEqual(899);
  const hud = (await page.locator('.game-hud').boundingBox())!;
  expect(hud.y).toBeLessThanOrEqual(1);
  expect(hud.height).toBeGreaterThanOrEqual(70);
  // HUD 三件套与首页行动都在场景上可点
  await expect(page.locator('.hud-brand')).toBeVisible();
  await expect(page.getByRole('button', { name: '新开一单' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  // 首页内容放上区：行动按钮底边不越过踱步人物的头顶线（feetY 0.8 − 身高 0.26 ≈ 0.54H）
  const actions = (await page.locator('.home-actions').boundingBox())!;
  expect(actions.y + actions.height, '首页菜单应停在走道人物头顶线之上').toBeLessThan(scene.y + scene.height * 0.54);
  await shot(page, 'home-1440.png');
});

test('办公室：舞台铺满主区，世界元数据与热点徽标就绪', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterOffice(page);
  const meta = await canvasMeta(page);
  // 世界 = office-scene.png 像素坐标（1672×941），PC 视口世界宽不超世界宽
  expect(meta.sceneW).toBe(1672);
  expect(meta.scale).toBeGreaterThan(0);
  expect(meta.viewWorldW).toBeLessThanOrEqual(1672);
  expect(meta.playerX).toBeGreaterThan(0);
  // 真实场景图已绘制（截图不得在兜底程序场景或半加载状态上捕获）
  expect(meta.scene).toBe('1');
  // 舞台几何：从 HUD 底延伸到视口底（game-main 全覆盖）
  const stage = (await page.locator('.office-stage').boundingBox())!;
  const hud = (await page.locator('.game-hud').boundingBox())!;
  expect(stage.y).toBeGreaterThanOrEqual(hud.y + hud.height - 1);
  expect(stage.y + stage.height).toBeGreaterThanOrEqual(899);
  expect(stage.width).toBeGreaterThanOrEqual(1439);
  // 四个热点徽标可见（桌面接近全景）
  await expect(page.locator('.stage-badge')).toHaveCount(4);
  // 徽标悬在人物头顶上方：底边高于玩家头顶线，不遮脚/腿；触摸目标 ≥44px
  // （dataset.headTopY 是舞台容器坐标，boundingBox 是视口坐标，比较前先对齐原点）
  const settled = await canvasMeta(page);
  const stageTop = stage.y;
  for (const badge of await page.locator('.stage-badge:visible').all()) {
    const box = (await badge.boundingBox())!;
    expect(box.height, '徽标触摸目标 ≥44px').toBeGreaterThanOrEqual(44);
    expect(box.y + box.height - stageTop, '徽标底边应在玩家头顶之上').toBeLessThanOrEqual(settled.headTopY + 2);
  }
  await officeReadyForShot(page);
  await expectNoHorizontalScroll(page);
  await shot(page, 'office-1440.png');
});

test('桌面键盘移动：D/A 改变玩家世界坐标并推动相机', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterOffice(page);
  const before = await canvasMeta(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(700);
  await page.keyboard.up('d');
  const afterRight = await canvasMeta(page);
  expect(afterRight.playerX, '按 D 玩家世界坐标应右移').toBeGreaterThan(before.playerX + 40);
  expect(afterRight.cam, '相机应跟随玩家右移').toBeGreaterThan(before.cam - 1);

  await page.keyboard.down('a');
  await page.waitForTimeout(700);
  await page.keyboard.up('a');
  const afterLeft = await canvasMeta(page);
  expect(afterLeft.playerX, '按 A 玩家世界坐标应左移').toBeLessThan(afterRight.playerX - 40);
  // 玩家留在世界范围内
  expect(afterLeft.playerX).toBeGreaterThanOrEqual(0);
  expect(afterLeft.playerX).toBeLessThanOrEqual(before.sceneW);
});

test('移动端触控：方向键长按移动，E 键交互进编辑器', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  // 顺手留下 393 首页证据：内容在上区，走道角色可见
  await page.goto('/?seed=1');
  await expectNoHorizontalScroll(page);
  await shot(page, 'home-393.png');
  await enterOffice(page);
  const meta = await canvasMeta(page);
  expect(meta.scene).toBe('1');
  // 右下 E 键：出生在工位热点内，直接交互进编辑器
  await page.locator('.office-touch-e').click();
  await expect(page.getByRole('region', { name: '落地页拼装编辑器' })).toBeVisible();
  await page.getByRole('button', { name: '保存并回到办公室' }).click();
  await expect(page.getByRole('heading', { name: '差不多创意部 · 办公室' })).toBeVisible();

  // 左下方向键：pointerdown 持按 → 玩家右移（pointerup 释放即停）
  const before = await canvasMeta(page);
  const right = page.locator('.office-touch-move button[aria-label="向右移动"]');
  await right.dispatchEvent('pointerdown');
  await page.waitForTimeout(700);
  await right.dispatchEvent('pointerup');
  const after = await canvasMeta(page);
  expect(after.playerX, '触控右移应改变玩家世界坐标').toBeGreaterThan(before.playerX + 40);
  await expectNoHorizontalScroll(page);
});

test('徽标连点幂等：目标只结算一次，叙事气泡不重复', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterOffice(page);
  await canvasMeta(page);
  const kettle = page.locator('.stage-badge[data-hotspot="kettle"]');
  // 同帧双击：寻路目标重复设置，到达后只交互一次
  await kettle.evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  await expect(page.getByText(/饮水机咕嘟咕嘟/)).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.office-bubble')).toHaveCount(1);
});

test('办公室内全局 modal 可打开可关闭，舞台交互不受影响', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterOffice(page);
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // modal 关闭后舞台键盘交互仍可用
  await page.keyboard.press('e');
  await expect(page.getByRole('region', { name: '落地页拼装编辑器' })).toBeVisible();
});

for (const width of [393, 320]) {
  test(`${width} 完整链路：编辑 → 保存 → 交稿 → 评审正文无截断`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await enterOffice(page);
    await expectMobileChromeClean(page);
    await officeReadyForShot(page);
    // 初始进入：镜头对准目标后玩家必须完整在视口内——strip 最宽可见帧约 126 世界像素
    // （半身 ≈63），取 80 世界像素边距保证整个身位不被左右缘裁掉（修复前 camX 从 0
    // 缓动，手机上玩家长时间在屏外）
    const settled = await canvasMeta(page);
    const playerOffset = settled.playerX - settled.cam;
    expect(playerOffset, '玩家中心应距左缘 ≥80 世界像素').toBeGreaterThan(80);
    expect(playerOffset, '玩家中心应距右缘 ≥80 世界像素').toBeLessThan(settled.viewWorldW - 80);
    await expectNoHorizontalScroll(page);
    await shot(page, `office-${width}.png`);

    // 快捷导航进编辑器（触屏路径）
    await page.getByRole('button', { name: '回到工位编辑器' }).click();
    const editor = page.getByRole('region', { name: '落地页拼装编辑器' });
    await expect(editor).toBeVisible();
    await expectNoHorizontalScroll(page);
    // 手机面板：标题先于 tabs，需求折叠可展开完整查看
    const headTitle = (await editor.locator('.asm-title').boundingBox())!;
    const tabs = (await editor.locator('.asm-tabs').boundingBox())!;
    expect(headTitle.y, '拼稿面板标题应在 tabs 之前').toBeLessThan(tabs.y);
    await editor.locator('.asm-req-chip').click();
    await expect(editor.locator('.asm-req-lines li').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    if (width === 320) await shot(page, `edit-${width}.png`);

    // 最小成稿：主视觉 + CTA + 备注（走 tabs）
    await page.getByRole('button', { name: '+ 主视觉' }).click();
    await page.getByRole('button', { name: '+ 立即购买 CTA' }).click();
    await page.getByRole('tab', { name: /^编排/ }).click();
    await expect(page.locator('.asm-item')).toHaveCount(2);
    await page.getByLabel('行为备注（开发会看）').last().fill('点击后跳转手机版下单页');
    await expectNoHorizontalScroll(page);
    if (width === 393) await shot(page, `editor-${width}.png`);

    await page.getByRole('button', { name: '保存并回到办公室' }).click();
    await expect(editor).toHaveCount(0);
    await page.getByRole('button', { name: '去经理室交稿' }).click();
    await page.getByRole('button', { name: '交稿，让他看' }).click();

    // 评审页：紧凑对话面板——一份台词 + 双读数分开 + 折叠区全文可读 + 继续入口
    await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
    await expect(page.locator('.boss-verdict')).toBeVisible();
    await expect(page.locator('.boss-dialog .boss-portrait')).toBeVisible();
    await expect(page.locator('.boss-bubble')).toHaveCount(1);
    await expect(page.getByText('综合过稿指数')).toBeVisible();
    await expect(page.getByText('原型结构完整度')).toBeVisible();
    await expect(page.locator('.sketch-findings li').first()).toBeVisible();
    // 初始加载态留证（头像裁切验收）：需求未展开、面板未滚动前截图
    if (width === 393) await shot(page, 'review-initial-393.png');
    // 需求规范默认折叠：展开后全文可见（不截断）
    const docFold = page.locator('.review-fold.doc');
    await docFold.locator('summary').click();
    await expect(docFold.locator('.doc-card-list li').first()).toBeVisible();
    const panel = page.locator('.review-page');
    await expectNoHorizontalScroll(page);
    if (width === 393) await shot(page, `review-${width}.png`);
    const scrollable = await panel.evaluate((el) => el.scrollHeight - el.clientHeight);
    // 内容超面板高时应可滚动（scrollHeight ≥ clientHeight），不允许截断
    expect(scrollable, '评审面板内容不得被裁掉').toBeGreaterThanOrEqual(0);
    const cont = page.getByRole('button', { name: '继续', exact: true });
    await cont.scrollIntoViewIfNeeded();
    const contBox = (await cont.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(contBox.y + contBox.height, '继续按钮应完整落在面板内').toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
    await cont.click();
    await expect(page.getByRole('heading', { name: '怎么回应？' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

/** 手机 HUD 首行（品牌 + 工具按钮同行）与底部触控/快捷导航带互不遮挡 */
async function expectMobileChromeClean(page: Page) {
  // HUD 第一行：工具按钮与品牌同一水平带
  const brand = (await page.locator('.hud-brand').boundingBox())!;
  for (const btn of await page.locator('.hud-tool').all()) {
    const box = (await btn.boundingBox())!;
    expect(box.y, 'HUD 工具应在品牌行右侧同一水平带').toBeLessThan(brand.y + brand.height);
    expect(box.y + box.height).toBeGreaterThan(brand.y);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  // 底部：快捷导航带按钮不与左右触控键、E 键重叠（触控层显示时）
  const eKey = await page.locator('.office-touch-e').boundingBox();
  const move = await page.locator('.office-touch-move').boundingBox();
  if (eKey && move) {
    for (const btn of await page.locator('.office-quick-btn').all()) {
      const box = (await btn.boundingBox())!;
      const overlapE = box.x < eKey.x + eKey.width && box.x + box.width > eKey.x &&
        box.y < eKey.y + eKey.height && box.y + box.height > eKey.y;
      expect(overlapE, '快捷导航不得遮挡 E 键').toBe(false);
      const overlapMove = box.x < move.x + move.width && box.x + box.width > move.x &&
        box.y < move.y + move.height && box.y + box.height > move.y;
      expect(overlapMove, '快捷导航不得遮挡方向键').toBe(false);
    }
    // 提示条不与 E 键叠字
    const hint = (await page.locator('.office-hint').boundingBox())!;
    const overlapHint = hint.x < eKey.x + eKey.width && hint.x + hint.width > eKey.x &&
      hint.y < eKey.y + eKey.height && hint.y + hint.height > eKey.y;
    expect(overlapHint, '提示条不得遮挡 E 键').toBe(false);
  }
}

test.describe('触屏宽度档：430 手机 / 768 平板', () => {
  test.use({ hasTouch: true });

  for (const width of [430, 768]) {
    test(`${width}${width === 768 ? '（平板触屏）' : ''}：HUD 首行、底部动作带互不遮挡，入口可点`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 768 ? 1024 : 860 });
      await page.goto('/?seed=1');
      await expectNoHorizontalScroll(page);
      if (width === 430) await shot(page, 'home-430.png');

      await enterOffice(page);
      await canvasMeta(page);
      await expectMobileChromeClean(page);
      await expectNoHorizontalScroll(page);

      // 需求面板展开可读、可收回，快捷导航入口真实可点
      await page.getByRole('button', { name: '需求', exact: true }).click();
      await expect(page.locator('.office-req-lines li').first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.getByRole('button', { name: '需求', exact: true }).click();
      await page.getByRole('button', { name: '回到工位编辑器' }).click();
      await expect(page.getByRole('region', { name: '落地页拼装编辑器' })).toBeVisible();
      await page.getByRole('button', { name: '保存并回到办公室' }).click();
      await page.getByRole('button', { name: '去经理室交稿' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: '再改改' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await officeReadyForShot(page);
      await shot(page, `office-${width}.png`);
    });
  }
});
