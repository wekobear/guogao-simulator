import { expect, test, type Page } from '@playwright/test';

/**
 * 拼装模式（认真模式 · 新手推荐入口）关键路径：
 * 入口 → 2.5D 办公室 → 工位拼装编辑器 → 交稿 → 经理逐条检查。
 * 覆盖：E 键交互、点击寻路叙事、空稿交稿、草稿刷新恢复。
 */

async function enterOffice(page: Page) {
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '新开一单' }).click();
  await page.getByRole('button', { name: /^进办公室拼页面/ }).click();
  await page.getByRole('button', { name: '开始这单' }).click();
  await expect(page.getByRole('heading', { name: '差不多创意部 · 办公室' })).toBeVisible();
}

test('E 键在工位打开拼装编辑器，保存后回到办公室', async ({ page }) => {
  await enterOffice(page);
  // 玩家出生点就在工位热点范围内
  await expect(page.getByText('到工位了——按 E 拼装落地页')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('region', { name: '落地页拼装编辑器' })).toBeVisible();
  await page.getByRole('button', { name: '保存并回到办公室' }).click();
  await expect(page.getByRole('region', { name: '落地页拼装编辑器' })).toHaveCount(0);
  await expect(page.getByText('到工位了——按 E 拼装落地页')).toBeVisible();
});

test('拼出完整落地页交稿，经理逐条检查通过', async ({ page }) => {
  await enterOffice(page);
  await page.keyboard.press('e');

  // 按需求拼：导航 → 主视觉 → 立即购买 → 备注块
  await page.getByRole('button', { name: '+ 导航栏' }).click();
  await page.getByRole('button', { name: '+ 主视觉' }).click();
  await page.getByRole('button', { name: '+ 立即购买 CTA' }).click();
  await page.getByRole('button', { name: '+ 备注块' }).click();

  // 顺序即几何：主视觉上移到导航之前，验证编排按钮真实改变顺序
  await page.getByRole('button', { name: '上移 主视觉' }).click();
  await expect(page.locator('.asm-item-name').first()).toContainText('主视觉');
  await expect(page.locator('.asm-item-name').nth(1)).toContainText('导航栏');

  // 行为备注进入部件
  await page.getByLabel('行为备注（开发会看）').last().fill('点击后跳转手机版下单页');

  // 实时预览不是清单：桌面与手机两种设备都能看到成页
  await expect(page.getByText('SHIYING 石影')).toBeVisible();
  await page.getByRole('button', { name: '手机', exact: true }).click();
  await expect(page.locator('.pv-cta').filter({ hasText: '立即购买' })).toBeVisible();

  await page.getByRole('button', { name: '保存并回到办公室' }).click();
  await page.getByRole('button', { name: '去经理室交稿' }).click();
  await expect(page.getByText(/已拼 4 个部件/)).toContainText('行为备注');
  await page.getByRole('button', { name: '交稿，让他看' }).click();

  // 评审页：紧凑对话面板 + 需求逐条通过；需求规范折叠区展开后全文可读
  await expect(page.getByText('主视觉、立即购买、手机竖屏、页面导航、品牌配色、行为备注：逐条通过。')).toBeVisible();
  await expect(page.locator('.boss-verdict')).toBeVisible();
  const docFold = page.locator('.review-fold.doc');
  await docFold.locator('summary').click();
  await expect(page.locator('.doc-card-list li').filter({ hasText: '包含移动端屏幕' })).toBeVisible();
  await expect(page.locator('.doc-card-list li').filter({ hasText: '已连接页面导航' })).toBeVisible();
});

test('空稿允许交，收到既有缺项反馈', async ({ page }) => {
  await enterOffice(page);
  await page.getByRole('button', { name: '去经理室交稿' }).click();
  await expect(page.getByText('还没拼任何部件——空稿也允许交，但会收到缺项反馈。')).toBeVisible();
  await page.getByRole('button', { name: '交稿，让他看' }).click();
  await expect(page.locator('.sketch-findings li', { hasText: '画布是空的' })).toBeVisible();
  await page.locator('.review-fold.doc').locator('summary').click();
  await expect(page.locator('.doc-card-list li', { hasText: '原型尚无屏幕或部件' })).toBeVisible();
});

test('点击茶水间徽标走过去，给叙事提示不改数值', async ({ page }) => {
  await enterOffice(page);
  // v0.3.0：世界 = office-scene.png 像素坐标（data-scene-w/h），点击热点徽标直达
  const canvas = page.locator('.office-canvas');
  await expect(canvas).toBeVisible();
  const sceneW = Number(await canvas.getAttribute('data-scene-w'));
  expect(sceneW).toBeGreaterThan(1000);
  // 玩家出生在工位（世界中部），桌面视口接近全景：茶水间徽标可见，点击即寻路
  await page.locator('.stage-badge[data-hotspot="kettle"]').click();
  await expect(page.getByText(/饮水机咕嘟咕嘟/)).toBeVisible({ timeout: 8000 });
  // dataset meta dump 存在且相机/玩家坐标都在世界范围内（移动换算正确性冒烟）
  const meta = await canvas.evaluate((el) => ({
    cam: Number((el as HTMLCanvasElement).dataset.cam),
    playerX: Number((el as HTMLCanvasElement).dataset.playerX),
    viewWorldW: Number((el as HTMLCanvasElement).dataset.viewWorldW),
  }));
  expect(meta.viewWorldW).toBeGreaterThan(0);
  expect(meta.playerX).toBeGreaterThan(0);
  expect(meta.playerX).toBeLessThanOrEqual(sceneW);
  expect(Math.abs(meta.cam)).toBeLessThanOrEqual(sceneW);
});

test('草稿按局隔离：刷新后回到编辑器部件还在', async ({ page }) => {
  await enterOffice(page);
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '+ 主视觉' }).click();
  await page.getByRole('button', { name: '+ 立即购买 CTA' }).click();
  await expect(page.locator('.asm-item')).toHaveCount(2);

  await page.reload();
  await page.getByRole('button', { name: '继续改稿' }).click();
  await page.getByRole('button', { name: '回到工位编辑器' }).click();
  await expect(page.locator('.asm-item')).toHaveCount(2);
  await expect(page.locator('.asm-item-name').first()).toContainText('主视觉');
});
