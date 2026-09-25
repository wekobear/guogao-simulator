import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const content = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/content/game.v1.json', import.meta.url)), 'utf-8'),
) as Content;

type Content = {
  templates: { id: string; name: string }[];
  preparations: { id: string; name: string }[];
  responses: { id: string; name: string }[];
  events: { id: string; title: string; options: { id: string; name: string }[] }[];
  endings: { id: string; title: string }[];
};

type FixtureAction = { type: string; id?: string };
type FixturePath = { endingId: string; templateId: string; actions: FixtureAction[] };

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../fixtures/golden-paths.json', import.meta.url)), 'utf-8'),
) as { seed: number; paths: FixturePath[] };

function nameOf(action: FixtureAction): string {
  const id = action.id ?? '';
  const pool =
    action.type === 'SUBMIT_PREP'
      ? content.preparations
      : action.type === 'CHOOSE_RESPONSE'
        ? content.responses
        : [];
  return pool.find((x) => x.id === id)?.name ?? id;
}

async function startRun(page: Page, templateId: string, seed = fixture.seed) {
  await page.goto(`/?seed=${seed}`);
  await page.getByRole('button', { name: '新开一单' }).click();
  const template = content.templates.find((t) => t.id === templateId)!;
  await page.getByRole('button', { name: new RegExp(`^${template.name}`) }).click();
  await page.getByRole('button', { name: '开始这单' }).click();
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
}

async function playPath(page: Page, path: FixturePath) {
  await startRun(page, path.templateId);
  for (const action of path.actions) {
    switch (action.type) {
      case 'SUBMIT_PREP': {
        await page.getByRole('button', { name: new RegExp(`^${nameOf(action)}`) }).click();
        await page.getByRole('button', { name: '提交这一稿' }).click();
        // 精力耗尽时直接进入结局（BURNOUT），否则进入评审
        const reviewOrEnding = page
          .getByRole('heading', { name: '评审结果' })
          .or(page.getByRole('heading', { name: /^结局：/ }));
        await expect(reviewOrEnding).toBeVisible();
        break;
      }
      case 'CONTINUE_REVIEW': {
        // 通过时是「看看奖金」，退回时是「继续」
        const btn = page.getByRole('button', { name: '继续' }).or(page.getByRole('button', { name: '看看奖金' }));
        await btn.click();
        break;
      }
      case 'CONFIRM_QUIT': {
        await page.getByRole('button', { name: '今天不干了（退出）' }).click();
        await page.getByRole('button', { name: '确认，今天不干了' }).click();
        break;
      }
      case 'CHOOSE_RESPONSE': {
        await expect(page.getByRole('heading', { name: '怎么回应？' })).toBeVisible();
        await page.getByRole('button', { name: new RegExp(`^${nameOf(action)}`) }).click();
        break;
      }
      case 'CHOOSE_EVENT_OPTION': {
        await expect(page.getByRole('heading', { name: /^职场插曲/ })).toBeVisible();
        const optionButton = page
          .locator('.options .option-card')
          .filter({ hasText: optionNameOf(action) });
        await optionButton.click();
        break;
      }
      case 'CHOOSE_BONUS': {
        await expect(page.getByRole('heading', { name: '分奖金' })).toBeVisible();
        const label = action.id === 'negotiate' ? '凭记录谈分成' : '接受分配';
        await page.locator('.options .option-card').filter({ hasText: label }).click();
        break;
      }
      case 'CHOOSE_PARTY': {
        await expect(page.getByRole('heading', { name: '庆功红包' })).toBeVisible();
        const label = action.id === 'self' ? '自己先领红包' : '请老板先来';
        await page.locator('.options .option-card').filter({ hasText: label }).click();
        break;
      }
      default:
        throw new Error(`未知动作 ${action.type}`);
    }
  }
  await expect(page.getByRole('heading', { name: /^结局：/ })).toBeVisible();
}

function optionNameOf(action: FixtureAction): string {
  // 在全部事件选项里按 id 找（不同事件选项名不重复）
  for (const event of content.events) {
    for (const option of event.options) {
      if (option.id === action.id) return option.name;
    }
  }
  return action.id ?? '';
}

test.describe('六条金色路径（真实点击到达，B02/T22）', () => {
  for (const path of fixture.paths) {
    test(`结局 ${path.endingId}`, async ({ page }) => {
      await playPath(page, path);
      const ending = content.endings.find((e) => e.id === path.endingId)!;
      await expect(page.getByRole('heading', { name: `结局：${ending.title}` })).toBeVisible();
    });
  }
});

test('同 seed 同操作重放结果一致（T12/B01）', async ({ page }) => {
  const path = fixture.paths.find((p) => p.endingId === 'PASS_PROTECTED')!;
  const capture = async () => {
    await playPath(page, path);
    const text = await page.locator('.result-card').innerText();
    await page.getByRole('button', { name: '再玩一局' }).click();
    return text;
  };
  const first = await capture();
  const second = await capture();
  expect(first).toBe(second);
});

test('评审页刷新后恢复且不重抽（B03）', async ({ page }) => {
  const path = fixture.paths.find((p) => p.endingId === 'PASS_PROTECTED')!;
  await startRun(page, path.templateId);
  const improve = content.preparations.find((p) => p.id === 'improve')!.name;
  await page.getByRole('button', { name: new RegExp(`^${improve}`) }).click();
  await page.getByRole('button', { name: '提交这一稿' }).click();
  await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
  const before = await page.locator('.score-value').innerText();
  await page.reload();
  await page.getByRole('button', { name: '继续改稿' }).click();
  await expect(page.getByRole('heading', { name: '评审结果' })).toBeVisible();
  const after = await page.locator('.score-value').innerText();
  expect(after).toBe(before);
});
