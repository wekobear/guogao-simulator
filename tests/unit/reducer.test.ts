import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/schema';
import { applyAction, createRun, envelope } from '../../src/game/reducer';
import type { ActionEnvelope, ActionType, Run } from '../../src/game/types';

const content = loadContent();

type Act = { type: ActionType; id?: string };

/** business 模板 seed=1 的 PASS 路径（与 golden fixture 第 1 条一致） */
const passPath: Act[] = [
  { type: 'SUBMIT_PREP', id: 'improve' },
  { type: 'CONTINUE_REVIEW' },
  { type: 'CHOOSE_RESPONSE', id: 'ask' },
  { type: 'CHOOSE_EVENT_OPTION', id: 'confirm' },
  { type: 'SUBMIT_PREP', id: 'improve' },
  { type: 'CONTINUE_REVIEW' },
  { type: 'CHOOSE_BONUS', id: 'negotiate' },
  { type: 'CHOOSE_PARTY', id: 'self' },
];

/** visual 模板 FIRED 路径前 9 步：执行后处于第 3 轮 REVIEW */
const firedPrefix: Act[] = [
  { type: 'SUBMIT_PREP', id: 'improve' },
  { type: 'CONTINUE_REVIEW' },
  { type: 'CHOOSE_RESPONSE', id: 'push' },
  { type: 'CHOOSE_EVENT_OPTION', id: 'confirm' },
  { type: 'SUBMIT_PREP', id: 'improve' },
  { type: 'CONTINUE_REVIEW' },
  { type: 'CHOOSE_RESPONSE', id: 'push' },
  { type: 'CHOOSE_EVENT_OPTION', id: 'keep' },
  { type: 'SUBMIT_PREP', id: 'improve' },
];

function replay(templateId: string, actions: Act[], upto: number = actions.length): Run {
  let run = createRun(1, templateId, content);
  for (let i = 0; i < upto; i += 1) {
    const action = actions[i]!;
    run = applyAction(run, envelope(run, action.type, action.id), content);
  }
  return run;
}

describe('createRun', () => {
  it('初始状态完整且处于 PREPARE', () => {
    const run = createRun(1, 'business', content);
    expect(run.schemaVersion).toBe(1);
    expect(run.contentVersion).toBe('1.0.0');
    expect(run.runId).toMatch(/^run-/);
    expect(run.seed).toBe(1);
    expect(run.rngState).toBe(1);
    expect(run.seq).toBe(0);
    expect(run.phase).toBe('PREPARE');
    expect(run.templateId).toBe('business');
    expect(run.round).toBe(1);
    expect(run.submittedCount).toBe(0);
    expect(run.stats).toEqual({ quality: 50, trust: 50, energy: 80, evidence: 30, scopeDebt: 0 });
    expect(run.seenEventIds).toEqual([]);
    expect(run.pendingEventId).toBeNull();
    expect(run.review).toBeNull();
    expect(run.reviews).toEqual([]);
    expect(run.history).toEqual([]);
    expect(run.bonus).toBeNull();
    expect(run.endingId).toBeNull();
    expect(run.hadCustomImage).toBe(false);
  });

  it('stats 是模板的拷贝而非同引用', () => {
    const run = createRun(2, 'visual', content);
    const tpl = content.templates.find((t) => t.id === 'visual')!;
    expect(run.stats).toEqual(tpl.stats);
    expect(run.stats).not.toBe(tpl.stats);
  });

  it('未知模板抛错', () => {
    expect(() => createRun(1, 'nope', content)).toThrow(/未知起手模板/);
  });

  it('seed 按 >>> 0 归一化为 uint32', () => {
    const run = createRun(-1, 'business', content);
    expect(run.seed).toBe(4294967295);
    expect(run.rngState).toBe(4294967295);
  });
});

describe('envelope', () => {
  it('携带当前 runId 与 seq；无 id 时不产生 id 字段', () => {
    const run = createRun(1, 'business', content);
    expect(envelope(run, 'SUBMIT_PREP', 'improve')).toEqual({
      runId: run.runId,
      expectedSeq: 0,
      type: 'SUBMIT_PREP',
      id: 'improve',
    });
    const noId = envelope(run, 'CONFIRM_QUIT');
    expect(noId).toEqual({ runId: run.runId, expectedSeq: 0, type: 'CONFIRM_QUIT' });
    expect('id' in noId).toBe(false);
    const after = applyAction(run, envelope(run, 'SUBMIT_PREP', 'improve'), content);
    expect(envelope(after, 'CONFIRM_QUIT').expectedSeq).toBe(1);
  });
});

describe('T06 精力耗尽直接 BURNOUT', () => {
  it('energy=15 时 improve（-18）→ ENDING/BURNOUT，不生成评审、submittedCount 不变', () => {
    const base = createRun(1, 'business', content);
    const low: Run = { ...base, stats: { ...base.stats, energy: 15 } };
    const out = applyAction(low, envelope(low, 'SUBMIT_PREP', 'improve'), content);
    expect(out.phase).toBe('ENDING');
    expect(out.endingId).toBe('BURNOUT');
    expect(out.submittedCount).toBe(0);
    expect(out.reviews).toEqual([]);
    expect(out.review).toBeNull();
    expect(out.stats.energy).toBe(0);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]!.kind).toBe('preparation');
  });

  it('边界：恰好归零（18-18=0）也 BURNOUT；剩 1 点则正常进 REVIEW', () => {
    const base = createRun(1, 'business', content);
    const exact: Run = { ...base, stats: { ...base.stats, energy: 18 } };
    expect(applyAction(exact, envelope(exact, 'SUBMIT_PREP', 'improve'), content).endingId).toBe('BURNOUT');
    const survive: Run = { ...base, stats: { ...base.stats, energy: 19 } };
    const ok = applyAction(survive, envelope(survive, 'SUBMIT_PREP', 'improve'), content);
    expect(ok.phase).toBe('REVIEW');
    expect(ok.stats.energy).toBe(1);
    expect(ok.submittedCount).toBe(1);
  });

  it('回应 / 插曲选项把精力打到 0 同样 BURNOUT，且不消耗随机', () => {
    const respond = replay('business', passPath, 2);
    expect(respond.phase).toBe('RESPOND');
    const lowRespond: Run = { ...respond, stats: { ...respond.stats, energy: 4 } };
    const out = applyAction(lowRespond, envelope(lowRespond, 'CHOOSE_RESPONSE', 'ask'), content);
    expect(out.phase).toBe('ENDING');
    expect(out.endingId).toBe('BURNOUT');
    expect(out.rngState).toBe(respond.rngState);

    const event = replay('business', passPath, 3);
    expect(event.phase).toBe('EVENT');
    const lowEvent: Run = { ...event, stats: { ...event.stats, energy: 5 } };
    const out2 = applyAction(lowEvent, envelope(lowEvent, 'CHOOSE_EVENT_OPTION', 'absorb'), content);
    expect(out2.phase).toBe('ENDING');
    expect(out2.endingId).toBe('BURNOUT');
  });
});

describe('T10 幂等：同一 envelope 连续提交两次', () => {
  it('第二次返回同一引用，数值只扣一次', () => {
    const run = createRun(1, 'business', content);
    const env = envelope(run, 'SUBMIT_PREP', 'improve');
    const first = applyAction(run, env, content);
    expect(first).not.toBe(run);
    expect(first.seq).toBe(1);
    expect(first.stats.energy).toBe(62);
    expect(first.stats.quality).toBe(65);
    expect(first.submittedCount).toBe(1);
    expect(first.reviews).toHaveLength(1);

    const second = applyAction(first, env, content);
    expect(second).toBe(first);
    expect(second.seq).toBe(1);
    expect(second.stats.energy).toBe(62);
    expect(second.submittedCount).toBe(1);
    expect(second.reviews).toHaveLength(1);
  });
});

describe('T11 阶段不符的非法动作', () => {
  it('PREPARE 发 CHOOSE_RESPONSE → 原引用', () => {
    const run = createRun(1, 'business', content);
    expect(applyAction(run, envelope(run, 'CHOOSE_RESPONSE', 'ask'), content)).toBe(run);
  });

  it('REVIEW 发 SUBMIT_PREP → 原引用', () => {
    const review = replay('business', passPath, 1);
    expect(review.phase).toBe('REVIEW');
    expect(applyAction(review, envelope(review, 'SUBMIT_PREP', 'improve'), content)).toBe(review);
  });

  it('runId / expectedSeq / 动作类型 / 条目 id 非法 → 原引用', () => {
    const run = createRun(1, 'business', content);
    const wrongRunId: ActionEnvelope = { runId: 'other-run', expectedSeq: 0, type: 'CONFIRM_QUIT' };
    expect(applyAction(run, wrongRunId, content)).toBe(run);
    const staleSeq: ActionEnvelope = { runId: run.runId, expectedSeq: 7, type: 'SUBMIT_PREP', id: 'improve' };
    expect(applyAction(run, staleSeq, content)).toBe(run);
    const unknownType = { runId: run.runId, expectedSeq: 0, type: 'HACK' } as unknown as ActionEnvelope;
    expect(applyAction(run, unknownType, content)).toBe(run);
    expect(applyAction(run, envelope(run, 'SUBMIT_PREP', 'nope'), content)).toBe(run);
  });

  it('BONUS / PARTY 未知选项 id → 原引用', () => {
    const bonus = replay('business', passPath, 6);
    expect(bonus.phase).toBe('BONUS');
    expect(applyAction(bonus, envelope(bonus, 'CHOOSE_BONUS', 'steal'), content)).toBe(bonus);
    const party = applyAction(bonus, envelope(bonus, 'CHOOSE_BONUS', 'accept'), content);
    expect(party.phase).toBe('PARTY');
    expect(applyAction(party, envelope(party, 'CHOOSE_PARTY', 'friend'), content)).toBe(party);
  });
});

describe('T13 EVENT 阶段非法动作', () => {
  it('状态原引用返回：pendingEventId / rngState / stats 全不变', () => {
    const event = replay('business', passPath, 3);
    expect(event.phase).toBe('EVENT');
    expect(event.pendingEventId).toBe('E02');
    const bad = applyAction(event, envelope(event, 'CHOOSE_RESPONSE', 'ask'), content);
    expect(bad).toBe(event);
    expect(bad.pendingEventId).toBe('E02');
    expect(bad.rngState).toBe(1015568748);
    expect(bad.stats).toEqual({ quality: 65, trust: 45, energy: 57, evidence: 45, scopeDebt: 0 });
    // 未知事件选项同样拒绝
    expect(applyAction(event, envelope(event, 'CHOOSE_EVENT_OPTION', 'nope'), content)).toBe(event);
  });
});

describe('T08 第三轮退回的 trust 25/26 分界', () => {
  const atReview3 = replay('visual', firedPrefix);

  it('前置：第 3 轮 REVIEW、trust=24、评审未通过', () => {
    expect(atReview3.phase).toBe('REVIEW');
    expect(atReview3.round).toBe(3);
    expect(atReview3.stats.trust).toBe(24);
    expect(atReview3.review?.passed).toBe(false);
  });

  it('trust 24（不干预）与手工改成 25 → FIRED；改成 26 → LOOP', () => {
    const fired = applyAction(atReview3, envelope(atReview3, 'CONTINUE_REVIEW'), content);
    expect(fired.phase).toBe('ENDING');
    expect(fired.endingId).toBe('FIRED');

    const t25: Run = { ...atReview3, stats: { ...atReview3.stats, trust: 25 } };
    const fired25 = applyAction(t25, envelope(t25, 'CONTINUE_REVIEW'), content);
    expect(fired25.phase).toBe('ENDING');
    expect(fired25.endingId).toBe('FIRED');

    const t26: Run = { ...atReview3, stats: { ...atReview3.stats, trust: 26 } };
    const loop = applyAction(t26, envelope(t26, 'CONTINUE_REVIEW'), content);
    expect(loop.phase).toBe('ENDING');
    expect(loop.endingId).toBe('LOOP');
  });

  it('ENDING 后任何动作被拒绝，不出现第四轮', () => {
    const fired = applyAction(atReview3, envelope(atReview3, 'CONTINUE_REVIEW'), content);
    // 导致结局的 CONTINUE_REVIEW 本身是合法动作（seq +1）
    expect(fired.seq).toBe(atReview3.seq + 1);
    expect(applyAction(fired, envelope(fired, 'CHOOSE_RESPONSE', 'ask'), content)).toBe(fired);
    expect(applyAction(fired, envelope(fired, 'SUBMIT_PREP', 'improve'), content)).toBe(fired);
    expect(applyAction(fired, envelope(fired, 'CONTINUE_REVIEW'), content)).toBe(fired);
    // 被拒动作原样返回同一引用：round/seq 均停在结局时刻，不出现第四轮
    expect(fired.round).toBe(3);
    expect(fired.seq).toBe(atReview3.seq + 1);
  });
});

describe('T15 谈判门槛 evidence/trust 双 40', () => {
  const atBonus = replay('business', passPath, 6);

  it('前置：BONUS 阶段基线 stats', () => {
    expect(atBonus.phase).toBe('BONUS');
    expect(atBonus.stats).toEqual({ quality: 80, trust: 40, energy: 39, evidence: 60, scopeDebt: 0 });
    expect(atBonus.bonus?.playerShare).toBeNull();
  });

  it('(39,40) / (40,39) / (39,39) 时 reducer 拒绝（原引用）', () => {
    for (const [evidence, trust] of [
      [39, 40],
      [40, 39],
      [39, 39],
    ] as const) {
      const run: Run = { ...atBonus, stats: { ...atBonus.stats, evidence, trust } };
      const out = applyAction(run, envelope(run, 'CHOOSE_BONUS', 'negotiate'), content);
      expect(out, `evidence=${evidence} trust=${trust} 应被拒绝`).toBe(run);
      expect(out.phase).toBe('BONUS');
      expect(out.bonus?.playerShare).toBeNull();
    }
  });

  it('(40,40) 时谈判成功：75 分成、cash 750、进入 PARTY', () => {
    const run: Run = { ...atBonus, stats: { ...atBonus.stats, evidence: 40, trust: 40 } };
    const out = applyAction(run, envelope(run, 'CHOOSE_BONUS', 'negotiate'), content);
    expect(out).not.toBe(run);
    expect(out.phase).toBe('PARTY');
    expect(out.bonus?.playerShare).toBe(75);
    expect(out.bonus?.cash).toBe(750);
  });
});

describe('T16 白盒：bossShare 70/75/80 → accept+self 的现金', () => {
  const atBonus = replay('business', passPath, 6);

  it.each([
    [70, 320],
    [75, 270],
    [80, 220],
  ] as const)('initialBossShare=%i → 最终 cash=%i（PASS_COMPROMISE）', (bossShare, expectedCash) => {
    const hacked: Run = {
      ...atBonus,
      bonus: { ...atBonus.bonus!, initialBossShare: bossShare },
    };
    let run = applyAction(hacked, envelope(hacked, 'CHOOSE_BONUS', 'accept'), content);
    expect(run.phase).toBe('PARTY');
    expect(run.bonus?.playerShare).toBe(100 - bossShare);
    expect(run.bonus?.cash).toBe(Math.round((1000 * (100 - bossShare)) / 100));
    run = applyAction(run, envelope(run, 'CHOOSE_PARTY', 'self'), content);
    expect(run.phase).toBe('ENDING');
    expect(run.endingId).toBe('PASS_COMPROMISE');
    expect(run.bonus?.cash).toBe(expectedCash);
    expect(run.bonus?.redPacket).toBe(20);
  });
});

describe('T19 ENDING 后的过期动作', () => {
  it('发送旧的 CHOOSE_EVENT_OPTION → 原引用，stats 不变', () => {
    const ended = replay('business', passPath);
    expect(ended.phase).toBe('ENDING');
    expect(ended.endingId).toBe('PASS_PROTECTED');
    const stale = applyAction(ended, envelope(ended, 'CHOOSE_EVENT_OPTION', 'confirm'), content);
    expect(stale).toBe(ended);
    expect(stale.stats).toEqual(ended.stats);
    expect(stale.seenEventIds).toEqual(ended.seenEventIds);
  });
});

describe('CONFIRM_QUIT', () => {
  it('PREPARE 可退出 → QUIT；REVIEW 阶段拒绝', () => {
    const run = createRun(1, 'business', content);
    const quit = applyAction(run, envelope(run, 'CONFIRM_QUIT'), content);
    expect(quit.phase).toBe('ENDING');
    expect(quit.endingId).toBe('QUIT');
    expect(quit.history).toHaveLength(1);
    expect(quit.history[0]!.kind).toBe('quit');
    expect(quit.submittedCount).toBe(0);

    const review = replay('business', passPath, 1);
    expect(applyAction(review, envelope(review, 'CONFIRM_QUIT'), content)).toBe(review);
  });
});
