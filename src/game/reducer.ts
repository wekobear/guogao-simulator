import { applyDelta, makeReview } from './scoring';
import { analyzeSketch } from './prototype';
import { drawU, pickEvent } from './random';
import type {
  ActionEnvelope,
  EndingId,
  GameContent,
  LogEntry,
  LogKind,
  Run,
  Stats,
} from './types';

const SCHEMA_VERSION = 1 as const;
const CONTENT_VERSION = '1.0.0';

let runCounter = 0;

/** 生成局 ID：时间戳 + 计数器 + 随机后缀，仅用于区分，不参与判定 */
function newRunId(): string {
  runCounter += 1;
  return `run-${Date.now().toString(36)}-${runCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** 拒绝非法动作：保留原状态引用（UI 以引用相等判断未生效），开发模式留痕 */
function reject(run: Run, message: string): Run {
  if (import.meta.env.DEV) {
    console.debug(`[reducer] 拒绝动作：${message}`);
  }
  return run;
}

export function createRun(
  seed: number,
  templateId: string,
  content: GameContent,
  opts?: { sketch?: boolean },
): Run {
  const template = content.templates.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`未知起手模板：${templateId}`);
  }
  const seedU32 = seed >>> 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    runId: newRunId(),
    seed: seedU32,
    rngState: seedU32,
    seq: 0,
    phase: 'PREPARE',
    templateId,
    round: 1,
    submittedCount: 0,
    stats: { ...template.stats },
    seenEventIds: [],
    pendingEventId: null,
    review: null,
    reviews: [],
    history: [],
    bonus: null,
    endingId: null,
    hadCustomImage: false,
    sketchMode: opts?.sketch === true,
    sketch: null,
  };
}

function log(
  run: Run,
  kind: LogKind,
  itemId: string,
  before: Stats,
  after: Stats,
  resultText: string,
  seq: number,
  optionId?: string,
): LogEntry {
  return {
    seq,
    kind,
    round: run.round,
    itemId,
    ...(optionId !== undefined ? { optionId } : {}),
    before,
    after,
    resultText,
  };
}

function endRun(run: Run, endingId: EndingId, seq: number): Run {
  return { ...run, seq, phase: 'ENDING', endingId };
}

/**
 * 纯函数 reducer：先校验 runId / expectedSeq / phase / id 合法性，
 * 不合法时返回原引用；连续双击的第二个同 seq 动作因此被忽略。
 */
export function applyAction(run: Run, env: ActionEnvelope, content: GameContent): Run {
  if (run.phase === 'ENDING') return reject(run, '对局已结束');
  if (env.runId !== run.runId) return reject(run, 'runId 不匹配');
  if (env.expectedSeq !== run.seq) return reject(run, `seq 过期（当前 ${run.seq}）`);
  const next = run.seq + 1;

  switch (env.type) {
    case 'SUBMIT_PREP': {
      if (run.phase !== 'PREPARE') return reject(run, '阶段不符');
      const prep = content.preparations.find((p) => p.id === env.id);
      if (!prep) return reject(run, `未知准备动作 ${env.id}`);
      const before = run.stats;
      const after = applyDelta(before, prep.deltas);
      const entry = log(run, 'preparation', prep.id, before, after, prep.resultText, next);
      const base: Run = { ...run, seq: next, stats: after, history: [...run.history, entry] };
      if (after.energy <= 0) {
        // 精力耗尽：直接 BURNOUT，不生成新评审、不增加 submittedCount
        return endRun(base, 'BURNOUT', next);
      }
      const review = makeReview(run.round, after, content.config, content.reviews);
      return {
        ...base,
        submittedCount: run.submittedCount + 1,
        review,
        reviews: [...run.reviews, review],
        phase: 'REVIEW',
      };
    }

    case 'SUBMIT_SKETCH': {
      if (run.phase !== 'PREPARE') return reject(run, '阶段不符');
      if (!run.sketchMode || run.sketch) return reject(run, '本单不需要原型交稿');
      const doc = env.sketch?.doc;
      if (doc === undefined || doc === null) return reject(run, '缺少原型数据');
      const analysis = analyzeSketch(doc);
      const before = run.stats;
      const after = applyDelta(before, analysis.statsDelta);
      const resultText = `你交上了亲手拼的原型（结构完整度 ${analysis.quality}/100）${
        analysis.summary.length > 0 ? `：${analysis.summary.slice(0, 2).join('；')}` : ''
      }。`;
      const entry = log(run, 'sketch', 'sketch', before, after, resultText, next);
      const base: Run = {
        ...run,
        seq: next,
        stats: after,
        history: [...run.history, entry],
        sketch: {
          round: 1,
          findings: analysis.findings,
          summary: analysis.summary,
          quality: analysis.quality,
        },
      };
      if (after.energy <= 0) return endRun(base, 'BURNOUT', next);
      const review = makeReview(run.round, after, content.config, content.reviews);
      return {
        ...base,
        submittedCount: run.submittedCount + 1,
        review,
        reviews: [...run.reviews, review],
        phase: 'REVIEW',
      };
    }

    case 'CONFIRM_QUIT': {
      if (run.phase !== 'PREPARE' && run.phase !== 'RESPOND') {
        return reject(run, '当前阶段不能退出');
      }
      const entry = log(
        run,
        'quit',
        'quit',
        run.stats,
        run.stats,
        '你合上电脑，说了句「明天见」。',
        next,
      );
      return endRun({ ...run, history: [...run.history, entry] }, 'QUIT', next);
    }

    case 'CONTINUE_REVIEW': {
      if (run.phase !== 'REVIEW' || !run.review) return reject(run, '阶段不符');
      if (run.review.passed) {
        // 过稿后首次进入 BONUS：消耗一次随机决定老板起手分成
        const { u, next: rngNext } = drawU(run.rngState);
        const idx = Math.min(2, Math.floor(u * 3));
        const bossShare = content.config.bossShares[idx] ?? 70;
        return {
          ...run,
          seq: next,
          rngState: rngNext,
          bonus: { initialBossShare: bossShare, playerShare: null, redPacket: 0, cash: 0 },
          phase: 'BONUS',
        };
      }
      if (run.round < 3) {
        return { ...run, seq: next, phase: 'RESPOND' };
      }
      // 第三轮退回：trust <= 25 开除，否则无限改稿
      return endRun(run, run.stats.trust <= 25 ? 'FIRED' : 'LOOP', next);
    }

    case 'CHOOSE_RESPONSE': {
      if (run.phase !== 'RESPOND') return reject(run, '阶段不符');
      const resp = content.responses.find((r) => r.id === env.id);
      if (!resp) return reject(run, `未知回应 ${env.id}`);
      const before = run.stats;
      const after = applyDelta(before, resp.deltas);
      const entry = log(run, 'response', resp.id, before, after, resp.resultText, next);
      const base: Run = { ...run, seq: next, stats: after, history: [...run.history, entry] };
      if (after.energy <= 0) return endRun(base, 'BURNOUT', next);
      const pool = content.events.filter((e) => !run.seenEventIds.includes(e.id));
      const picked = pickEvent(pool, run.rngState);
      if (!picked) {
        // 内容异常兜底：跳过事件，round+1 回 PREPARE，不阻塞流程
        console.error('[reducer] 事件池为空，跳过插曲');
        return {
          ...base,
          round: Math.min(3, run.round + 1) as Run['round'],
          review: null,
          pendingEventId: null,
          phase: 'PREPARE',
        };
      }
      return {
        ...base,
        rngState: picked.rngState,
        seenEventIds: [...run.seenEventIds, picked.event.id],
        pendingEventId: picked.event.id,
        phase: 'EVENT',
      };
    }

    case 'CHOOSE_EVENT_OPTION': {
      if (run.phase !== 'EVENT' || !run.pendingEventId) return reject(run, '阶段不符');
      const event = content.events.find((e) => e.id === run.pendingEventId);
      if (!event) return reject(run, `未知事件 ${run.pendingEventId}`);
      const option = event.options.find((o) => o.id === env.id);
      if (!option) return reject(run, `未知事件选项 ${env.id}`);
      const before = run.stats;
      const after = applyDelta(before, option.deltas);
      const entry = log(run, 'event', event.id, before, after, option.resultText, next, option.id);
      const base: Run = { ...run, seq: next, stats: after, history: [...run.history, entry] };
      if (after.energy <= 0) return endRun(base, 'BURNOUT', next);
      return {
        ...base,
        round: Math.min(3, run.round + 1) as Run['round'],
        review: null,
        pendingEventId: null,
        phase: 'PREPARE',
      };
    }

    case 'CHOOSE_BONUS': {
      if (run.phase !== 'BONUS' || !run.bonus) return reject(run, '阶段不符');
      const cfg = content.config;
      if (env.id === 'accept') {
        const playerShare = 100 - run.bonus.initialBossShare;
        const cash = Math.round((cfg.bonusPool * playerShare) / 100);
        const entry = log(
          run,
          'bonus',
          'accept',
          run.stats,
          run.stats,
          `你接受了分配：老板 ${run.bonus.initialBossShare}%，你 ${playerShare}%。`,
          next,
        );
        return {
          ...run,
          seq: next,
          bonus: { ...run.bonus, playerShare, cash },
          history: [...run.history, entry],
          phase: 'PARTY',
        };
      }
      if (env.id === 'negotiate') {
        const req = cfg.negotiate.requires;
        if (!(run.stats.evidence >= req.evidence && run.stats.trust >= req.trust)) {
          return reject(run, '谈判条件不足');
        }
        const playerShare = cfg.negotiate.playerShare;
        const cash = Math.round((cfg.bonusPool * playerShare) / 100);
        const entry = log(
          run,
          'bonus',
          'negotiate',
          run.stats,
          run.stats,
          `你翻开沟通记录，一条条对齐。雕茅经理沉默半晌：「行吧，你 ${playerShare}%。」`,
          next,
        );
        return {
          ...run,
          seq: next,
          bonus: { ...run.bonus, playerShare, cash },
          history: [...run.history, entry],
          phase: 'PARTY',
        };
      }
      return reject(run, `未知奖金选项 ${env.id}`);
    }

    case 'CHOOSE_PARTY': {
      if (run.phase !== 'PARTY' || !run.bonus) return reject(run, '阶段不符');
      const cfg = content.config;
      const isSelf = env.id === 'self';
      if (env.id !== 'self' && env.id !== 'boss') {
        return reject(run, `未知庆功选项 ${env.id}`);
      }
      const redPacket = isSelf ? cfg.redPacket.self : cfg.redPacket.boss;
      const cash = run.bonus.cash + redPacket;
      const resultText = isSelf
        ? '你手快，先领了红包。20 元到账，聊胜于无。'
        : '你客气了一下，雕茅经理已经把红包拆了：「下次请你喝咖啡。」';
      const entry = log(run, 'party', env.id, run.stats, run.stats, resultText, next);
      const playerShare = run.bonus.playerShare ?? 0;
      const endingId: EndingId = playerShare >= 70 ? 'PASS_PROTECTED' : 'PASS_COMPROMISE';
      return endRun(
        {
          ...run,
          bonus: { ...run.bonus, redPacket, cash },
          history: [...run.history, entry],
        },
        endingId,
        next,
      );
    }

    default:
      return reject(run, '未知动作类型');
  }
}

/** UI 辅助：构造带当前 seq 的动作信封 */
export function envelope(
  run: Run,
  type: ActionEnvelope['type'],
  id?: string,
  extra?: { sketch?: { doc: unknown } },
): ActionEnvelope {
  return {
    runId: run.runId,
    expectedSeq: run.seq,
    type,
    ...(id ? { id } : {}),
    ...(extra?.sketch ? { sketch: extra.sketch } : {}),
  };
}
