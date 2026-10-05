import { useEffect, useState } from 'react';
import type { GameContent, Run } from '../game/types';
import { ResultBanner } from '../components/ResultBanner';
import { REASON_TEXT } from '../game/scoring';
import { ScriptReviewTextProvider } from '../services/reviewText';
import { SKETCH_FINDING_TEXT, sketchLines } from '../content/sketchLines';
import { BOSS_IDLE_URL } from '../components/office/artAssets';
import { useViewFocus } from './useViewFocus';

const provider = new ScriptReviewTextProvider();

type Props = {
  run: Run;
  content: GameContent;
  reduceMotion: boolean;
  onContinue: () => void;
};

/**
 * 评审视图（v0.3.0 polish）：紧凑游戏对话面板——经理肖像 + 一句台词 + 判定章，
 * 分数区把「综合过稿指数」（本局选择算出）与「原型结构完整度」（analyzeSketch
 * 冻结值）明确分成两个读数；原型检查 / 需求规范可折叠、全文能展开读完。
 * 台词只显示一份；评分规则与数据不动。
 */
export function ReviewView({ run, content, reduceMotion, onContinue }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const [bossText, setBossText] = useState<string | null>(null);
  const review = run.review;
  const lastEntry = run.history[run.history.length - 1];
  const sketch = run.sketch ?? null;

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

  const spokenLine = sketch
    ? (sketchBossLine ?? (review.passed ? '行吧，先发给运营看看。' : '重做。'))
    : (bossText ?? '雕茅经理正在看稿……');

  return (
    <div className="page review-page">
      <h1 className="view-title review-title" ref={ref} tabIndex={-1}>
        评审结果
      </h1>

      {/* 紧凑对话面板：经理肖像（boss-idle 放大裁显头肩）+ 一份台词 + 判定章 */}
      <section className="boss-dialog" aria-label="经理评审对话">
        <span className="boss-portrait-wrap" aria-hidden="true">
          <img className="boss-portrait" src={BOSS_IDLE_URL} alt="" />
        </span>
        <div className="boss-dialog-body">
          <p className="boss-dialog-name">
            {content.config.boss.name}·逐条对需求
          </p>
          <p className="boss-bubble" role="status">
            「{spokenLine}」
          </p>
        </div>
        <div
          className={`boss-verdict ${review.passed ? 'pass' : 'fail'}${reduceMotion ? '' : ' fx-stamp'}`}
          aria-hidden="true"
        >
          {review.passed ? `过稿 ${review.grade}` : 'REJECTED'}
        </div>
      </section>

      {/* 分数区：两个读数明确分开，紧凑双行 */}
      <section className="review-scores" aria-label="评审分数">
        <div className="score-block main">
          <div
            className={`score-value ${review.passed ? 'pass' : 'fail'}`}
            aria-label={`综合过稿指数 ${review.score} 分`}
          >
            {review.score}
          </div>
          <div className="score-meta">
            <p className="score-title">综合过稿指数</p>
            <p className="score-sub">
              <span className={`grade-badge ${review.passed ? 'pass' : 'fail'}`} aria-label={`等级 ${review.grade}`}>
                {review.grade}
              </span>
              <span className={`verdict ${review.passed ? 'pass' : 'fail'}`}>
                {review.passed ? '流程通过' : '退回重改'}
              </span>
            </p>
            <p className="score-note">按本局选择计算，不代表真实作品水平。</p>
          </div>
        </div>
        {sketch ? (
          <div className="score-block structure">
            <div className="score-value structure" aria-label={`原型结构完整度 ${sketch.quality} 分`}>
              {sketch.quality}
            </div>
            <div className="score-meta">
              <p className="score-title">原型结构完整度</p>
              <p className="score-note">交稿那一刻冻结的原型检查结果，与全局指数分开记。</p>
            </div>
          </div>
        ) : null}
        {review.reasonIds.length > 0 ? (
          <details className="score-reasons">
            <summary>未满足条件 {review.reasonIds.length} 条</summary>
            <ul className="reason-list">
              {review.reasonIds.map((id) => (
                <li key={id}>未满足：{REASON_TEXT[id]}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {lastEntry && (lastEntry.kind === 'preparation' || lastEntry.kind === 'sketch') ? (
        <ResultBanner entry={lastEntry} />
      ) : null}

      {sketch ? (
        <details className="review-fold findings" open>
          <summary>原型检查（对照需求逐条）</summary>
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
        </details>
      ) : null}

      {sketch ? (
        <details className="review-fold doc">
          <summary>需求文档 · {sketchLines.docCard.title}</summary>
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
        </details>
      ) : null}

      <button type="button" className="btn btn-primary btn-block review-continue" onClick={onContinue}>
        {review.passed ? '看看奖金' : '继续'}
      </button>
    </div>
  );
}
