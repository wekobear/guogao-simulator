import { describe, expect, it } from 'vitest';
import rawContent from '../../src/content/game.v1.json';
import fixture from '../../fixtures/golden-paths.json';
import { gameContentSchema, loadContent, validateReferences } from '../../src/content/schema';

const content = loadContent();

describe('T01 内容包', () => {
  it('loadContent 不抛错，且返回缓存实例', () => {
    expect(() => loadContent()).not.toThrow();
    expect(loadContent()).toBe(content);
  });

  it('原始 JSON 直接通过 zod schema', () => {
    const parsed = gameContentSchema.safeParse(rawContent);
    expect(parsed.success).toBe(true);
  });

  it('validateReferences 返回空数组', () => {
    expect(validateReferences(content)).toEqual([]);
  });

  it('数量：3 模板 / 5 准备 / 3 回应 / 6 插曲 / 6 结局', () => {
    expect(content.templates).toHaveLength(3);
    expect(content.preparations).toHaveLength(5);
    expect(content.responses).toHaveLength(3);
    expect(content.events).toHaveLength(6);
    expect(content.endings).toHaveLength(6);
  });

  it('每个插曲至少 2 个选项', () => {
    for (const event of content.events) {
      expect(event.options.length, `事件 ${event.id} 选项数`).toBeGreaterThanOrEqual(2);
    }
  });

  it('六个结局 ID 齐全', () => {
    const ids = content.endings.map((e) => e.id).sort();
    expect(ids).toEqual(['BURNOUT', 'FIRED', 'LOOP', 'PASS_COMPROMISE', 'PASS_PROTECTED', 'QUIT']);
  });

  it('规则常量锚点：过线阈值 / 等级分界 / 权重 / 奖金参数', () => {
    expect(content.config.pass).toEqual({ minScore: 65, minTrust: 40, minEvidence: 20, altTrust: 75 });
    expect(content.config.scoreWeights).toEqual({ quality: 0.6, trust: 0.25, evidence: 0.15, scopeDebtPenalty: 5 });
    expect(content.config.gradeBounds).toEqual([
      { min: 80, grade: 'S' },
      { min: 65, grade: 'A' },
      { min: 50, grade: 'B' },
      { min: 35, grade: 'C' },
      { min: 0, grade: 'D' },
    ]);
    expect(content.config.maxSubmissions).toBe(3);
    expect(content.config.bonusPool).toBe(1000);
    expect(content.config.bossShares).toEqual([70, 75, 80]);
    expect(content.config.negotiate).toEqual({ requires: { evidence: 40, trust: 40 }, playerShare: 75 });
    expect(content.config.redPacket).toEqual({ self: 20, boss: 0 });
  });

  it('golden fixture 元信息与内容版本一致，六条路径覆盖全部结局', () => {
    expect(fixture.seed).toBe(1);
    expect(fixture.contentVersion).toBe(content.contentVersion);
    expect(fixture.paths).toHaveLength(6);
    const endings = fixture.paths.map((p) => p.endingId).sort();
    expect(endings).toEqual(['BURNOUT', 'FIRED', 'LOOP', 'PASS_COMPROMISE', 'PASS_PROTECTED', 'QUIT']);
    for (const path of fixture.paths) {
      expect(path.actions.length, `${path.templateId} 路径动作数`).toBe(path.expected.length);
    }
  });
});
