import { z } from 'zod';

const statKey = z.enum(['quality', 'trust', 'energy', 'evidence', 'scopeDebt']);

const statsDelta = z.strictObject({
  quality: z.number().int().optional(),
  trust: z.number().int().optional(),
  energy: z.number().int().optional(),
  evidence: z.number().int().optional(),
  scopeDebt: z.number().int().optional(),
});

const stats = z.object({
  quality: z.number().int().min(0).max(100),
  trust: z.number().int().min(0).max(100),
  energy: z.number().int().min(0).max(100),
  evidence: z.number().int().min(0).max(100),
  scopeDebt: z.number().int().min(0).max(3),
});

const config = z.object({
  company: z.string().min(1),
  boss: z.object({ id: z.string().min(1), name: z.string().min(1), avatarChar: z.string().min(1) }),
  playerAvatarChar: z.string().min(1),
  brief: z.object({
    id: z.string().min(1),
    brand: z.string().min(1),
    title: z.string().min(1),
    requirementLines: z.array(z.string().min(1)).min(3).max(3),
    bossExtra: z.string().min(1),
    deliverableNote: z.string().min(1),
  }),
  maxSubmissions: z.literal(3),
  pass: z.object({
    minScore: z.number().int().min(0).max(100),
    minTrust: z.number().int().min(0).max(100),
    minEvidence: z.number().int().min(0).max(100),
    altTrust: z.number().int().min(0).max(100),
  }),
  scoreWeights: z.object({
    quality: z.number(),
    trust: z.number(),
    evidence: z.number(),
    scopeDebtPenalty: z.number().int(),
  }),
  gradeBounds: z.array(z.object({ min: z.number().int().min(0).max(100), grade: z.enum(['S', 'A', 'B', 'C', 'D']) })),
  statsMeta: z.record(statKey, z.object({ label: z.string().min(1), max: z.number().int(), scoreCost: z.string().optional() })),
  bonusPool: z.number().int().positive(),
  bossShares: z.array(z.number().int().min(0).max(100)).length(3),
  negotiate: z.object({
    requires: z.object({ evidence: z.number().int(), trust: z.number().int() }),
    playerShare: z.number().int().min(0).max(100),
  }),
  redPacket: z.object({ self: z.number().int(), boss: z.number().int() }),
  currency: z.string().min(1),
});

const template = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  stats,
});

const preparation = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  deltas: statsDelta,
  resultText: z.string().min(1),
});

const response = preparation;

const eventOption = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  deltas: statsDelta,
  resultText: z.string().min(1),
});

const event = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  scene: z.string().min(1),
  weight: z.number().int().positive(),
  options: z.array(eventOption).min(2),
});

const ending = z.object({
  id: z.enum(['PASS_PROTECTED', 'PASS_COMPROMISE', 'BURNOUT', 'FIRED', 'LOOP', 'QUIT']),
  title: z.string().min(1),
  body: z.string().min(1),
  hint: z.string().min(1),
});

export const gameContentSchema = z.object({
  contentVersion: z.string().min(1),
  config,
  templates: z.array(template).length(3),
  preparations: z.array(preparation).length(5),
  responses: z.array(response).length(3),
  events: z.array(event).length(6),
  reviews: z.object({
    prefix: z.string().min(1),
    sGradeLine: z.string().min(1),
    lines: z.record(z.enum(['S', 'A', 'B', 'C', 'D']), z.object({ passed: z.string().min(1), fail: z.string().min(1) })),
  }),
  endings: z.array(ending).length(6),
});

export type RawGameContent = z.infer<typeof gameContentSchema>;

/** 结构校验之上的引用与规则自洽检查；返回错误列表（空 = 通过） */
export function validateReferences(content: RawGameContent): string[] {
  const errors: string[] = [];
  const dup = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${what} ID 重复：${id}`);
      seen.add(id);
    }
  };
  dup(content.templates.map((t) => t.id), '模板');
  dup(content.preparations.map((p) => p.id), '准备动作');
  dup(content.responses.map((r) => r.id), '回应');
  dup(content.events.map((e) => e.id), '插曲');
  dup(content.endings.map((e) => e.id), '结局');
  for (const event of content.events) {
    dup(event.options.map((o) => o.id), `插曲 ${event.id} 选项`);
  }
  // 六个结局定义完整
  const required = ['PASS_PROTECTED', 'PASS_COMPROMISE', 'BURNOUT', 'FIRED', 'LOOP', 'QUIT'];
  for (const id of required) {
    if (!content.endings.some((e) => e.id === id)) errors.push(`缺少结局定义：${id}`);
  }
  // 等级覆盖 0–100
  const bounds = [...content.config.gradeBounds].sort((a, b) => b.min - a.min);
  if (bounds[bounds.length - 1]!.min !== 0) errors.push('等级边界未覆盖到 0');
  for (let i = 0; i < bounds.length - 1; i += 1) {
    if (bounds[i]!.min <= bounds[i + 1]!.min) errors.push('等级边界重叠或乱序');
  }
  // bonus.requires 与 config 阈值一致（本包即同一来源，检查不漂移）
  const neg = content.config.negotiate;
  if (neg.requires.evidence < 0 || neg.requires.trust < 0) errors.push('谈判阈值非法');
  if (content.config.redPacket.self < 0 || content.config.redPacket.boss < 0) errors.push('红包数值非法');
  return errors;
}

import rawContent from './game.v1.json' with { type: 'json' };

let cached: RawGameContent | null = null;

export function loadContent(): RawGameContent {
  if (cached) return cached;
  const parsed = gameContentSchema.safeParse(rawContent);
  if (!parsed.success) {
    throw new Error(`内容数据校验失败：${parsed.error.message}`);
  }
  const refErrors = validateReferences(parsed.data);
  if (refErrors.length > 0) {
    throw new Error(`内容引用错误：${refErrors.join('；')}`);
  }
  cached = parsed.data;
  return cached;
}
