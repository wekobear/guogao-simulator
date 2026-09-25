import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/golden-paths.json';
import { loadContent } from '../../src/content/schema';
import { applyAction, createRun, envelope } from '../../src/game/reducer';
import type { ActionType, EndingId, Grade, Phase, Run, Stats } from '../../src/game/types';

const content = loadContent();

type FixtureAction = { type: ActionType; id?: string };
type ExpectedStep = {
  phase?: Phase;
  round?: number;
  submittedCount?: number;
  stats?: Stats;
  review?: { score: number; grade: Grade; passed: boolean };
  endingId?: EndingId;
  bonusCash?: number;
  playerShare?: number | null;
};
type FixturePath = {
  endingId: EndingId;
  templateId: string;
  actions: FixtureAction[];
  expected: ExpectedStep[];
};
type FixtureShape = {
  seed: number;
  contentVersion: string;
  generatedBy: string;
  paths: FixturePath[];
  sGradePath: FixtureAction[] | null;
};

const fx = fixture as unknown as FixtureShape;

function replayActions(templateId: string, actions: FixtureAction[]): Run {
  let run = createRun(fx.seed, templateId, content);
  for (const action of actions) {
    run = applyAction(run, envelope(run, action.type, action.id), content);
  }
  return run;
}

describe('T22 golden 六条路径逐步重放', () => {
  fx.paths.forEach((path, pathIndex) => {
    it(`路径 ${pathIndex}：${path.templateId} → ${path.endingId}`, () => {
      let run = createRun(fx.seed, path.templateId, content);
      path.actions.forEach((action, actionIndex) => {
        const before = run;
        run = applyAction(run, envelope(run, action.type, action.id), content);
        expect(
          run,
          `路径 ${pathIndex} 第 ${actionIndex} 步（${action.type}${action.id ? `/${action.id}` : ''}）不应被拒绝`,
        ).not.toBe(before);
        expect(run.seq, `路径 ${pathIndex} 第 ${actionIndex} 步 seq 应 +1`).toBe(actionIndex + 1);

        const exp = path.expected[actionIndex];
        if (!exp) throw new Error(`fixture 路径 ${pathIndex} 缺少第 ${actionIndex} 步的 expected`);
        const where = `路径 ${pathIndex} 第 ${actionIndex} 步`;

        if (exp.phase !== undefined) expect(run.phase, `${where} phase`).toBe(exp.phase);
        if (exp.round !== undefined) expect(run.round, `${where} round`).toBe(exp.round);
        if (exp.submittedCount !== undefined) {
          expect(run.submittedCount, `${where} submittedCount`).toBe(exp.submittedCount);
        }
        if (exp.stats !== undefined) expect(run.stats, `${where} stats`).toEqual(exp.stats);
        if (exp.review !== undefined) {
          expect(run.review, `${where} 应存在评审快照`).not.toBeNull();
          expect(run.review!.score, `${where} score`).toBe(exp.review.score);
          expect(run.review!.grade, `${where} grade`).toBe(exp.review.grade);
          expect(run.review!.passed, `${where} passed`).toBe(exp.review.passed);
          expect(run.review!.round, `${where} 评审轮次`).toBe(exp.round ?? run.round);
        } else {
          expect(run.review, `${where} 不应残留评审快照`).toBeNull();
        }
        if (exp.endingId !== undefined) expect(run.endingId, `${where} endingId`).toBe(exp.endingId);
        if (exp.bonusCash !== undefined) expect(run.bonus?.cash, `${where} bonusCash`).toBe(exp.bonusCash);
        if (exp.playerShare !== undefined) {
          expect(run.bonus?.playerShare, `${where} playerShare`).toBe(exp.playerShare);
        }
      });

      expect(path.expected.length).toBe(path.actions.length);
      expect(run.phase).toBe('ENDING');
      expect(run.endingId).toBe(path.endingId);
    });
  });
});

describe('T09 第三轮通过 → 进入 BONUS', () => {
  it('把 LOOP 路径第 3 轮提交前的 trust 手工补到 40，通过后 CONTINUE_REVIEW 进 BONUS', () => {
    const loopPath = fx.paths[4]!;
    let run = createRun(fx.seed, loopPath.templateId, content);
    for (const action of loopPath.actions.slice(0, 8)) {
      run = applyAction(run, envelope(run, action.type, action.id), content);
    }
    expect(run.phase).toBe('PREPARE');
    expect(run.round).toBe(3);
    expect(run.stats.trust).toBe(35);

    run = { ...run, stats: { ...run.stats, trust: 40 } };
    run = applyAction(run, envelope(run, 'SUBMIT_PREP', 'improve'), content);
    expect(run.phase).toBe('REVIEW');
    expect(run.round).toBe(3);
    expect(run.submittedCount).toBe(3);
    expect(run.review?.passed).toBe(true);
    expect(run.review?.score).toBe(79);
    expect(run.review?.grade).toBe('A');

    run = applyAction(run, envelope(run, 'CONTINUE_REVIEW'), content);
    expect(run.phase).toBe('BONUS');
    expect(run.bonus).not.toBeNull();
    expect([70, 75, 80]).toContain(run.bonus!.initialBossShare);
    expect(run.bonus!.playerShare).toBeNull();
    expect(run.bonus!.cash).toBe(0);
    expect(run.bonus!.redPacket).toBe(0);
  });
});

describe('T12 同 seed 同模板同操作重放两次', () => {
  it('除 runId 外全部字段 deep equal', () => {
    const path = fx.paths[0]!;
    const first = replayActions(path.templateId, path.actions);
    const second = replayActions(path.templateId, path.actions);
    expect(first.runId).not.toBe(second.runId);
    expect({ ...first, runId: 'same' }).toEqual({ ...second, runId: 'same' });
  });
});

describe('T14 一局两个插曲 id 不同', () => {
  it('BURNOUT 路径（classic）两轮事件去重', () => {
    const path = fx.paths[2]!;
    const run = replayActions(path.templateId, path.actions);
    expect(run.seenEventIds).toHaveLength(2);
    expect(new Set(run.seenEventIds).size).toBe(2);
    expect(run.seenEventIds).toEqual(['E02', 'E03']);
  });
});

describe('T17/T18 golden PASS_PROTECTED 路径的谈判分成', () => {
  it('T17 negotiate + self → cash 770、playerShare 75、PASS_PROTECTED', () => {
    const path = fx.paths[0]!;
    const run = replayActions(path.templateId, path.actions);
    expect(run.endingId).toBe('PASS_PROTECTED');
    expect(run.bonus?.playerShare).toBe(75);
    expect(run.bonus?.cash).toBe(770); // 1000 * 75% + 红包 20
    expect(run.bonus?.redPacket).toBe(20);
  });

  it('T18 negotiate + boss → cash 750（红包 0），仍是 PASS_PROTECTED', () => {
    const path = fx.paths[0]!;
    const actions = path.actions
      .slice(0, path.actions.length - 1)
      .concat([{ type: 'CHOOSE_PARTY', id: 'boss' }]);
    const run = replayActions(path.templateId, actions);
    expect(run.endingId).toBe('PASS_PROTECTED');
    expect(run.bonus?.playerShare).toBe(75);
    expect(run.bonus?.cash).toBe(750);
    expect(run.bonus?.redPacket).toBe(0);
  });
});

describe('T22b fixture.sGradePath（business / seed 1）', () => {
  it('重放后出现 S 级评审，且该评审文本包含「自己再想想吧」', () => {
    const actions = fx.sGradePath ?? [];
    expect(actions.length).toBeGreaterThan(0);
    const run = replayActions('business', actions);
    const sReviews = run.reviews.filter((r) => r.grade === 'S');
    expect(sReviews.length).toBeGreaterThan(0);
    for (const review of sReviews) {
      expect(review.text).toContain('自己再想想吧。');
      expect(review.text.startsWith('感觉很奇怪。')).toBe(true);
    }
    expect(run.reviews[run.reviews.length - 1]?.grade).toBe('S');
    expect(run.reviews[run.reviews.length - 1]?.round).toBe(3);
  });
});
