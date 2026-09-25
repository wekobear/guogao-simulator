import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const content = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/content/game.v1.json', import.meta.url)), 'utf-8'),
) as {
  preparations: { id: string; name: string }[];
};

/** 1x1 红色 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function enterWorkspace(page: import('@playwright/test').Page) {
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '新开一单' }).click();
  await page.getByRole('button', { name: /^信息优先/ }).click();
  await page.getByRole('button', { name: '开始这单' }).click();
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
}

test('上传、替换、放大、移除图片（B05）', async ({ page }) => {
  await enterWorkspace(page);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: TINY_PNG });
  const img = page.locator('img.draft-custom');
  await expect(img).toBeVisible();
  const scoreBefore = await page.locator('.stat-value').first().innerText();

  // 放大查看
  await page.getByRole('button', { name: '放大查看' }).click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).first().click();

  // 替换
  await fileInput.setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.locator('img.draft-custom')).toBeVisible();

  // 移除 → 回到内置稿
  await page.getByRole('button', { name: '移除，用内置稿' }).click();
  await expect(page.locator('img.draft-custom')).toHaveCount(0);
  await expect(page.locator('.draft-frame')).toBeVisible();

  // 指标不受图片影响
  const scoreAfter = await page.locator('.stat-value').first().innerText();
  expect(scoreAfter).toBe(scoreBefore);
});

test('错误类型与损坏文件给出具体错误（B06）', async ({ page }) => {
  await enterWorkspace(page);
  const fileInput = page.locator('input[type="file"]');
  // 文本文件伪装成 png
  await fileInput.setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image at all'),
  });
  await expect(page.locator('.notice.error')).toContainText('不支持的图片格式');
  // 无内置稿可回退时仍保留旧图（此处无图，页面不崩溃）
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
});

test('超 8MiB 文件被拒绝（B06）', async ({ page }) => {
  await enterWorkspace(page);
  const big = Buffer.concat([TINY_PNG, Buffer.alloc(9 * 1024 * 1024)]);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'big.png',
    mimeType: 'image/png',
    buffer: big,
  });
  await expect(page.locator('.notice.error')).toContainText('8 MiB');
});

test('选图后刷新：进度保留、图回模板（B07）', async ({ page }) => {
  await enterWorkspace(page);
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.locator('img.draft-custom')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '继续改稿' }).click();
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
  await expect(page.locator('img.draft-custom')).toHaveCount(0);
  await expect(page.getByText('进度已恢复，图片需重新选择')).toBeVisible();
});

test('连续快速点击不重复结算（B04）', async ({ page }) => {
  await enterWorkspace(page);
  const improve = content.preparations.find((p) => p.id === 'improve')!.name;
  await page.getByRole('button', { name: new RegExp(`^${improve}`) }).click();
  // 同一任务内同步双击：两次 dispatch 同 seq，reducer 必须只结算一次
  await page.getByRole('button', { name: '提交这一稿' }).evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
  // 只扣了一次精力：80 - 18 = 62
  await expect(page.getByText('稿件准备度 +15，剩余精力 -18')).toBeVisible();
});

test('360px 窄屏无横向滚动、提交按钮可见（B08）', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await enterWorkspace(page);
  const scrollWidth = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0);
  expect(scrollWidth).toBeLessThanOrEqual(360);
  await expect(page.getByRole('button', { name: '提交这一稿' })).toBeVisible();
});

test('键盘可完成基本操作、弹窗可 Esc 关闭（B09）', async ({ page }) => {
  // 说明：合成输入下 WebKit 的纯 Tab 焦点顺序有引擎怪癖（程序化 focus 后 Tab 落回 body），
  // 真实用户路径不受影响；此处验证键盘激活与弹窗回焦。
  await page.goto('/');
  const start = page.getByRole('button', { name: '新开一单' });
  await start.waitFor();
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '本单需求' })).toBeVisible();

  // 回首页，验证空格激活与弹窗 Esc、焦点回归
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.getByRole('button', { name: '新开一单' }).waitFor();
  const howto = page.getByRole('button', { name: '玩法说明' });
  await howto.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: '玩法说明' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '玩法说明' })).toHaveCount(0);
  await expect(howto).toBeFocused();
});

test('复制成功与失败兜底（B11）', async ({ page }) => {
  // 走最短路径到结局：QUIT
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '新开一单' }).click();
  await page.getByRole('button', { name: /^信息优先/ }).click();
  await page.getByRole('button', { name: '开始这单' }).click();
  await page.getByRole('button', { name: '今天不干了（退出）' }).click();
  await page.getByRole('button', { name: '确认，今天不干了' }).click();
  await expect(page.getByRole('heading', { name: '结局：主动下班' })).toBeVisible();

  // 剪贴板拒绝 → 出现可手选文本
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.getByRole('button', { name: '复制结果' }).click();
  await expect(page.getByText('复制失败，请手动选中下面文本复制')).toBeVisible();
  await expect(page.locator('textarea.copy-fallback')).toBeVisible();

  // 剪贴板可用 → 提示成功
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await page.getByRole('button', { name: '复制结果' }).click();
  await expect(page.getByText('已复制到剪贴板。')).toBeVisible();
});

test('两个标签页交替操作检测冲突（B12）', async ({ browser }) => {
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  await page1.goto('/?seed=1');
  await page1.getByRole('button', { name: '新开一单' }).click();
  await page1.getByRole('button', { name: /^信息优先/ }).click();
  await page1.getByRole('button', { name: '开始这单' }).click();
  await expect(page1.getByRole('heading', { name: '工作台' })).toBeVisible();

  // 页面 2 从存档继续并操作一步
  await page2.goto('/');
  await page2.getByRole('button', { name: '继续改稿' }).click();
  await expect(page2.getByRole('heading', { name: '工作台' })).toBeVisible();
  const improve = content.preparations.find((p) => p.id === 'improve')!.name;
  await page2.getByRole('button', { name: new RegExp(`^${improve}`) }).click();
  await page2.getByRole('button', { name: '提交这一稿' }).click();
  await expect(page2.getByRole('heading', { name: '评审结果' })).toBeVisible();

  // 页面 1 应提示状态过期
  await expect(page1.getByText('检测到另一个标签页更新了这一局')).toBeVisible();
  await context.close();
});

test('清除存档：取消不丢进度，确认按范围清除（B13）', async ({ page }) => {
  await enterWorkspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '清除当前局' }).click();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('button', { name: '继续改稿' })).toBeVisible();

  await page.getByRole('button', { name: '清除当前局' }).click();
  await page.getByRole('button', { name: '确认清除' }).click();
  await expect(page.getByRole('button', { name: '继续改稿' })).toHaveCount(0);
});
