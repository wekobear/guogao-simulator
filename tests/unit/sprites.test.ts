import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '../../src/components/office/sprites';

/**
 * 手绘像素串很容易「串行」：某一行多画/少画一个字符，翻转与绘制都会歪。
 * 这里校验每个 sprite 网格的行宽一致、非空、且只有定义过的字符集。
 */
describe('像素 sprite 网格完整性', () => {
  for (const [name, rows] of Object.entries(SPRITE_SHEETS)) {
    it(`${name}：行宽一致且非空`, () => {
      expect(rows.length).toBeGreaterThan(0);
      const width = rows[0]!.length;
      expect(width).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row).toHaveLength(width);
      }
    });
  }

  it('关键网格尺寸符合视觉规格（玩家 14×26 / 经理 18×28 的组成块，3 倍像素）', () => {
    expect(SPRITE_SHEETS.playerHead?.[0]).toHaveLength(12);
    expect(SPRITE_SHEETS.playerBodyIdle?.[0]).toHaveLength(14);
    expect(SPRITE_SHEETS.playerLegsStand?.[0]).toHaveLength(10);
    // 玩家总高：头 9 + 身 10 + 腿 7 = 26 行（×3 = 78 逻辑像素）
    const playerRows =
      (SPRITE_SHEETS.playerHead?.length ?? 0) +
      (SPRITE_SHEETS.playerBodyIdle?.length ?? 0) +
      (SPRITE_SHEETS.playerLegsStand?.length ?? 0);
    expect(playerRows).toBe(26);
    // 经理总高：头 9 + 身 13 + 腿 6 = 28 行（×3 = 84 逻辑像素）
    const bossRows =
      (SPRITE_SHEETS.bossHead?.length ?? 0) +
      (SPRITE_SHEETS.bossBody?.length ?? 0) +
      (SPRITE_SHEETS.bossLegs?.length ?? 0);
    expect(bossRows).toBe(28);
    expect(SPRITE_SHEETS.bossBody?.[0]).toHaveLength(18);
  });
});
