import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * 移动端适配回归（v0.2.1）：
 * 覆盖 393px 上报告的三个问题——回应横幅正文被指标挤成窄列、插曲小节标题紧贴内容、
 * 选项标题黑字贴深色卡——并审计 320–1280 各档宽度主要页面无横向滚动。
 * 全程走真实 UI（固定 seed=1 的金色路径），不注入任何状态。
 */

const content = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/content/game.v1.json', import.meta.url)), 'utf-8'),
) as {
  templates: { id: string; name: string }[];
  preparations: { id: string; name: string }[];
  responses: { id: string; name: string }[];
  events: { id: string; title: string; options: { id: string; name: string }[] }[];
};

const EVIDENCE_DIR = process.env.EVIDENCE_DIR
  ? path.resolve(process.env.EVIDENCE_DIR)
  : fileURLToPath(new URL('../../test-results/mobile-evidence/', import.meta.url));
mkdirSync(EVIDENCE_DIR, { recursive: true });

const prepName = (id: string) => content.preparations.find((p) => p.id === id)!.name;
const respName = (id: string) => content.responses.find((r) => r.id === id)!.name;
const eventOptionName = (id: string) => {
  for (const event of content.events) {
    const opt = event.options.find((o) => o.id === id);
    if (opt) return opt.name;
  }
  throw new Error(`unknown event option ${id}`);
};

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, name), fullPage: true });
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

/** h1 每行宽度（以 em 计）：跨文本节点按行聚类，用于断言最后一行不出现孤字 */
async function titleLineWidthsEm(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const h1 = document.querySelector('h1');
    if (!h1) return [];
    const range = document.createRange();
    range.selectNodeContents(h1);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
    rects.sort((a, b) => a.top - b.top);
    const lines: { top: number; left: number; right: number }[] = [];
    for (const r of rects) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(r.top - last.top) < r.height * 0.6) {
        last.left = Math.min(last.left, r.left);
        last.right = Math.max(last.right, r.right);
      } else {
        lines.push({ top: r.top, left: r.left, right: r.right });
      }
    }
    const fontSize = parseFloat(getComputedStyle(h1).fontSize);
    return lines.map((l) => (l.right - l.left) / fontSize);
  });
}

/** 前景/背景对比度（WCAG 相对亮度），用于验证选项标题在深色卡上可读 */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const cs = getComputedStyle(el);
    const card = (el.closest('.option-card, .template-card') as HTMLElement | null) ?? el;
    const bg = getComputedStyle(card).backgroundColor;
    const parse = (s: string): [number, number, number] => {
      const m = s.match(/[\d.]+/g) ?? [];
      return [Number(m[0]), Number(m[1]), Number(m[2])];
    };
    const lum = (rgb: [number, number, number]) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const l1 = lum(parse(cs.color));
    const l2 = lum(parse(bg));
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }, selector);
}

/** 真实 UI 到经典模板工作台（seed=1，金色路径同款） */
async function startClassicRun(page: Page) {
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '新开一单' }).click();
  const tpl = content.templates.find((t) => t.id === 'business')!;
  await page.getByRole('button', { name: new RegExp(`^${tpl.name}`) }).click();
  await page.getByRole('button', { name: '开始这单' }).click();
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
}

/** 第一次退回后选择「追问」，到达带回应横幅的插曲页（用户报告的场景） */
async function gotoEventWithResponseBanner(page: Page) {
  await startClassicRun(page);
  await page.getByRole('button', { name: new RegExp(`^${prepName('improve')}`) }).click();
  await page.getByRole('button', { name: '提交这一稿' }).click();
  await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByRole('heading', { name: '怎么回应？' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${respName('ask')}`) }).click();
  await expect(page.getByRole('heading', { name: /^职场插曲/ })).toBeVisible();
  await expect(page.locator('.result-banner')).toBeVisible();
}

test.describe('用户报告问题回归：插曲页（393 / 320）', () => {
  for (const width of [393, 320]) {
    test(`${width}px 回应横幅上下排列、标题间距、选项对比度、无横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 852 });
      await gotoEventWithResponseBanner(page);
      await expectNoHorizontalScroll(page);

      // 回应正文与数值变化上下排列：delta 顶边在正文底边之下
      const text = (await page.locator('.result-banner .rb-text').boundingBox())!;
      const delta = (await page.locator('.result-banner .rb-delta').boundingBox())!;
      expect(delta.y).toBeGreaterThanOrEqual(text.y + text.height - 1);
      // 正文不再被指标挤成窄列：至少占横幅内容宽的一半
      const banner = (await page.locator('.result-banner').boundingBox())!;
      expect(text.width).toBeGreaterThanOrEqual((banner.width - 24) * 0.5);

      // 「你怎么办（立即结算）」与选项列表之间有清楚间距
      const label = (await page.getByText('你怎么办（立即结算）').boundingBox())!;
      const firstCard = (await page.locator('.options .option-card').first().boundingBox())!;
      expect(firstCard.y - (label.y + label.height)).toBeGreaterThanOrEqual(6);

      // 选项标题在深色卡上可读：对比度 ≥ 4.5:1
      expect(await contrastOf(page, '.option-name')).toBeGreaterThanOrEqual(4.5);

      // h1 长标题（text-wrap: balance）均衡断行：最后一行至少容下两个汉字，不出现孤字
      const lineWidths = await titleLineWidthsEm(page);
      expect(lineWidths.length, '插曲页 h1 应当存在').toBeGreaterThan(0);
      const lastLine = lineWidths[lineWidths.length - 1]!;
      expect(lastLine, `最后一行宽 ${lastLine.toFixed(2)}em，不足 2em 视为孤字`).toBeGreaterThanOrEqual(2);

      await shot(page, `event-${width}.png`);
    });
  }
});

test('拼装器 393：上下结构，添加/编辑/预览/保存全流程可用', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: '新开一单' }).click();
  await page.getByRole('button', { name: /^进办公室拼页面/ }).click();
  await page.getByRole('button', { name: '开始这单' }).click();
  await expect(page.getByRole('heading', { name: '差不多创意部 · 办公室' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 触屏路径：用按钮进编辑器，不依赖键盘 E
  await page.getByRole('button', { name: '回到工位编辑器' }).click();
  const editor = page.getByRole('region', { name: '落地页拼装编辑器' });
  await expect(editor).toBeVisible();

  // 窄屏为上下单列：部件池 → 编排轨道 → 预览 依次向下排
  const pool = (await page.getByText('添加部件（按落地页从上到下拼）').boundingBox())!;
  const track = (await page.getByText('编排轨道（拖拽或用按钮调整顺序）').boundingBox())!;
  const preview = (await page.getByText(/实时预览/).boundingBox())!;
  expect(track.y).toBeGreaterThan(pool.y);
  expect(preview.y).toBeGreaterThan(track.y);
  await expectNoHorizontalScroll(page);

  // 添加部件 → 编辑行为备注 → 切手机预览 → 保存回办公室 → 交稿
  await page.getByRole('button', { name: '+ 导航栏' }).click();
  await page.getByRole('button', { name: '+ 主视觉' }).click();
  await page.getByRole('button', { name: '+ 立即购买 CTA' }).click();
  await expect(page.locator('.asm-item')).toHaveCount(3);
  await page.getByLabel('行为备注（开发会看）').last().fill('点击后跳转手机版下单页');
  await page.getByRole('button', { name: '手机', exact: true }).click();
  await expect(page.locator('.pv-cta').filter({ hasText: '立即购买' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'assembler-393.png');

  await page.getByRole('button', { name: '保存并回到办公室' }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: '去经理室交稿' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // 印章入场动画（240ms，scale 2.2 起跳）已用 .boss-stage-wrap overflow:clip 限制在舞台内；
  // 这里逐帧采样动画全程的 scrollWidth，不允许只等动画结束跳过入场阶段
  await page.evaluate(() => {
    const w = window as typeof window & { __maxOverflowX: number };
    w.__maxOverflowX = 0;
    const sample = () => {
      w.__maxOverflowX = Math.max(
        w.__maxOverflowX,
        document.documentElement.scrollWidth - window.innerWidth,
        document.body.scrollWidth - window.innerWidth,
      );
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: '交稿，让他看' }).click();
  await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
  // 等印章动画自然播完，确保采样窗口覆盖完整入场阶段
  await page.waitForFunction(() => {
    const stamp = document.querySelector('.boss-verdict');
    return !stamp || stamp.getAnimations().every((a) => a.playState === 'finished');
  });
  const maxOverflow = await page.evaluate(
    () => (window as typeof window & { __maxOverflowX: number }).__maxOverflowX,
  );
  expect(maxOverflow, '入场动画全程 documentElement/body 均不得超出视口').toBeLessThanOrEqual(1);
  await expectNoHorizontalScroll(page);
  // 台词气泡完整落在舞台容器内：overflow:clip 只裁印章装饰，不裁正文与台词
  const stage = (await page.locator('.boss-stage-wrap').boundingBox())!;
  const bubble = (await page.locator('.boss-bubble').boundingBox())!;
  expect(bubble.y).toBeGreaterThanOrEqual(stage.y - 0.5);
  expect(bubble.y + bubble.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5);
  await shot(page, 'review-393.png');
});

test('分奖金与庆功页 393：无横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await gotoEventWithResponseBanner(page);
  // seed=1 金色路径：插曲选「confirm」→ 二轮 improve 过稿 → 分奖金
  await page.locator('.options .option-card').filter({ hasText: eventOptionName('confirm') }).click();
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${prepName('improve')}`) }).click();
  await page.getByRole('button', { name: '提交这一稿' }).click();
  await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
  await page.getByRole('button', { name: '看看奖金' }).click();
  await expect(page.getByRole('heading', { name: '分奖金' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'bonus-393.png');

  await page.locator('.options .option-card').filter({ hasText: '接受分配' }).click();
  await expect(page.getByRole('heading', { name: '庆功红包' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'party-393.png');

  await page.locator('.options .option-card').filter({ hasText: '自己先领红包' }).click();
  await expect(page.getByRole('heading', { name: /^结局：/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test.describe('全页面宽度审计：无横向滚动', () => {
  for (const width of [320, 360, 393, 430, 768, 1280]) {
    test(`${width}px 首页/模态框/需求/工作台/评审/回应/插曲/结局`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 852 });

      // 首页 + 三个模态框（玩法 / 图鉴 / 设置）
      await page.goto('/?seed=1');
      await expectNoHorizontalScroll(page);
      if (width === 320 || width === 1280) await shot(page, `home-${width}.png`);
      for (const name of ['玩法说明', '结局图鉴', '设置']) {
        await page.getByRole('button', { name }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoHorizontalScroll(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }

      // 需求页（方案选择）
      await page.getByRole('button', { name: '新开一单' }).click();
      await expectNoHorizontalScroll(page);
      if (width === 393) await shot(page, 'brief-393.png');
      const tpl = content.templates.find((t) => t.id === 'business')!;
      await page.getByRole('button', { name: new RegExp(`^${tpl.name}`) }).click();
      await page.getByRole('button', { name: '开始这单' }).click();
      await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      if (width === 393) await shot(page, 'workspace-393.png');

      // 评审 → 回应 → 插曲
      await page.getByRole('button', { name: new RegExp(`^${prepName('improve')}`) }).click();
      await page.getByRole('button', { name: '提交这一稿' }).click();
      await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      if (width === 320) await shot(page, 'review-320.png');
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await expect(page.getByRole('heading', { name: '怎么回应？' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.getByRole('button', { name: new RegExp(`^${respName('ask')}`) }).click();
      await expect(page.getByRole('heading', { name: /^职场插曲/ })).toBeVisible();
      await expectNoHorizontalScroll(page);

      // 插曲结算 → 二轮工作台 → 主动下班到结局
      await page.locator('.options .option-card').filter({ hasText: eventOptionName('confirm') }).click();
      await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.getByRole('button', { name: '今天不干了（退出）' }).click();
      await page.getByRole('button', { name: '确认，今天不干了' }).click();
      await expect(page.getByRole('heading', { name: /^结局：/ })).toBeVisible();
      await expectNoHorizontalScroll(page);
      if (width === 393) await shot(page, 'ending-393.png');
    });
  }
});

test.describe('统一顶栏：品牌入口 + 玩法说明 / 结局图鉴 / 设置', () => {
  for (const width of [320, 393, 1280]) {
    test(`${width}px 首页顶栏单行、触摸目标达标、三入口可用、底部无重复`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 852 });
      await page.goto('/?seed=1');
      await expect(page.locator('.topbar')).toBeVisible();
      await expectNoHorizontalScroll(page);

      // 单行：三个工具按钮与品牌同一水平带（不换行、不溢出）
      const brand = (await page.locator('.topbar .brand').boundingBox())!;
      const tools = page.locator('.topbar .topbar-tool');
      await expect(tools).toHaveCount(3);
      for (const btn of await tools.all()) {
        const box = (await btn.boundingBox())!;
        expect(box.y, `${width}px 顶栏按钮应与品牌同行`).toBeLessThan(brand.y + brand.height);
        expect(box.y + box.height, `${width}px 顶栏按钮应与品牌同行`).toBeGreaterThan(brand.y);
        // 触摸目标 ≥44px、图标 22–24px
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        const icon = (await btn.locator('svg').boundingBox())!;
        expect(icon.width).toBeGreaterThanOrEqual(22);
        expect(icon.width).toBeLessThanOrEqual(24);
      }

      // 三个入口逐个打开对应模态并可关闭（accessible name 与模态标题一致）
      for (const name of ['玩法说明', '结局图鉴', '设置']) {
        await page.getByRole('button', { name }).click();
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }

      // 底部不再有重复入口：每个工具在整页只有一个按钮
      for (const name of ['玩法说明', '结局图鉴', '设置']) {
        await expect(page.getByRole('button', { name })).toHaveCount(1);
      }
      // 主要操作保留
      await expect(page.getByRole('button', { name: '新开一单' })).toBeVisible();

      await shot(page, `home-nav-${width}.png`);
    });
  }

  test('393 局内（工作台）顶栏不破版且含设置入口', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await startClassicRun(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // 局内品牌可回首页；新增设置入口可用
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await shot(page, 'workspace-nav-393.png');
  });
});
