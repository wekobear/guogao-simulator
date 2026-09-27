import { useEffect, useRef, useState } from 'react';
import type { GameContent, Run } from '../game/types';
import { ChatBubble } from '../components/ChatBubble';
import { ResultBanner } from '../components/ResultBanner';
import { REASON_TEXT } from '../game/scoring';
import { ScriptReviewTextProvider } from '../services/reviewText';
import { SKETCH_FINDING_TEXT, sketchLines } from '../content/sketchLines';
import { useViewFocus } from './useViewFocus';
import { OfficeStage, type StageState } from '../components/office/OfficeStage';
import { burstVerdictParticles } from '../components/office/sceneDraw';

const provider = new ScriptReviewTextProvider();

type Props = {
  run: Run;
  content: GameContent;
  reduceMotion: boolean;
  onContinue: () => void;
};

export function ReviewView({ run, content, reduceMotion, onContinue }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const [bossText, setBossText] = useState<string | null>(null);
  const review = run.review;
  const lastEntry = run.history[run.history.length - 1];
  const sketch = run.sketch ?? null;

  // 像素对峙舞台状态：玩家台阶下仰角举稿，经理按结果俯视
  const stageRef = useRef<StageState>({
    playerX: 770,
    playerDir: 1,
    playerPose: 'submit',
    bossMood: review?.passed ? 'pleased' : 'angry',
    bossVisible: true,
    fx: { verdictFx: review?.passed ? 1 : 2, dimLamps: true },
  });
  useEffect(() => {
    if (!reduceMotion) burstVerdictParticles(review?.passed ? 'gold' : 'confetti');
  }, [review?.passed, reduceMotion]);

  useEffect(() => {
    if (!review) return;
    let alive = true;
    // 脚本评语适配层：同步可得，这里仍走 Promise 以保持二期接口形态
    void provider
      .generate({ reviewId: `${run.runId}:round-${review.round}`, review, bossId: content.config.boss.id })
      .then((r) => {
        if (alive) setBossText(r.text);
      });
    return () => {
      alive = false;
    };
  }, [review, run.runId, content.config.boss.id]);

  if (!review) return null;

  // 认真模式台词必须与真实 findings 一致：有缺项 → 按缺项挑台词；
  // 逐条全过但综合分不够 → 「东西齐了，但我还没准备好认可」，
  // 说明结构完整度与综合过稿指数的差别，不虚构缺件，也不改评分。
  let sketchBossLine: string | null = null;
  if (sketch) {
    if (sketch.findings.length > 0) {
      const first = sketch.findings.find((f) => (sketchLines.bossLines[f] ?? []).length > 0);
      if (first) {
        const lines = sketchLines.bossLines[first] ?? [];
        sketchBossLine = lines[(review.score + first.length) % lines.length] ?? null;
      }
    } else if (review.passed && review.grade === 'S') {
      sketchBossLine =
        sketchLines.praise[(review.score + review.round) % sketchLines.praise.length] ?? null;
    } else if (review.passed) {
      const lines = sketchLines.allPassJustPassed;
      sketchBossLine = lines[review.round % lines.length] ?? null;
    } else {
      const lines = sketchLines.allPassLowScore;
      sketchBossLine = lines[(review.score + review.round) % lines.length] ?? null;
    }
  }

  return (
    <div className="page">
      <h1 className="view-title" ref={ref} tabIndex={-1}>
        评审结果
      </h1>
      {lastEntry && (lastEntry.kind === 'preparation' || lastEntry.kind === 'sketch') ? (
        <ResultBanner entry={lastEntry} />
      ) : null}

      {sketch ? (
        <div className="boss-stage-wrap">
          <OfficeStage mode="boss" reduceMotion={reduceMotion} stateRef={stageRef} />
          <div className={`boss-verdict ${review.passed ? 'pass' : 'fail'}`} aria-hidden="true">
            {review.passed ? `过稿 ${review.grade}` : 'REJECTED'}
          </div>
          <div className="boss-bubble" role="status">
            「{sketchBossLine ?? (review.passed ? '行吧，先发给运营看看。' : '重做。')}」
          </div>
        </div>
      ) : null}

      <section className="card" aria-label="本局过稿指数">
        <div className="score-hero">
          <p className="score-title">本局过稿指数</p>
          <div
            className={`score-value ${review.passed ? 'pass' : 'fail'}`}
            aria-label={`过稿指数 ${review.score} 分`}
          >
            {review.score}
          </div>
          <div className={`grade-badge ${review.passed ? 'pass' : 'fail'}`} aria-label={`等级 ${review.grade}`}>
            {review.grade}
          </div>
          <p className={`verdict ${review.passed ? 'pass' : 'fail'}`}>
            {review.passed ? '流程通过' : '退回重改'}
          </p>
          {review.reasonIds.length > 0 ? (
            <ul className="reason-list">
              {review.reasonIds.map((id) => (
                <li key={id}>未满足：{REASON_TEXT[id]}</li>
              ))}
            </ul>
          ) : null}
          <p className="score-note">按本局选择计算，不代表真实作品水平。</p>
        </div>
      </section>

      <section className="chat" aria-label="老板反馈">
        <ChatBubble actor="boss" content={content}>
          {/* 认真模式：台词与逐条检查同源，避免「检查全过却说缺产品图」的矛盾 */}
          {sketch
            ? (sketchBossLine ?? (review.passed ? '行吧，先发给运营看看。' : '重做。'))
            : (bossText ?? '雕茅经理正在看稿……')}
        </ChatBubble>
      </section>

      {sketch ? (
        <section className="card" aria-label="原型检查">
          <p className="section-label">原型检查（对照需求逐条）</p>
          <ul className="sketch-findings">
            {sketch.findings.length === 0 ? (
              <li className="ok">主视觉、立即购买、手机竖屏、页面导航、品牌配色、行为备注：逐条通过。</li>
            ) : (
              sketch.findings.map((f) => (
                <li key={f} className="bad">
                  {SKETCH_FINDING_TEXT[f]}
                </li>
              ))
            )}
          </ul>
          {sketchBossLine ? <p className="sketch-boss">「{sketchBossLine}」</p> : null}
          <div className="doc-card" aria-label="需求文档卡片">
            <p className="doc-card-title">{sketchLines.docCard.title}</p>
            <p className="doc-card-sub">{sketchLines.docCard.subtitle}</p>
            <ul className="doc-card-list">
              {sketch.summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="doc-card-footer">雕茅批注：{sketchLines.docCard.footer}</p>
          </div>
        </section>
      ) : null}

      <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
        {review.passed ? '看看奖金' : '继续'}
      </button>
    </div>
  );
}
