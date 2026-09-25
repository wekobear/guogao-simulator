import { useState } from 'react';
import type { GameContent, Run } from '../game/types';
import { gradeOrDash, keyChoices, shareCopy } from '../game/selectors';
import { useViewFocus } from './useViewFocus';
import stampUrl from '../assets/stamp.svg';

type Props = {
  run: Run;
  content: GameContent;
  onReplay: () => void;
  onHome: () => void;
  track: (event: string, payload?: Record<string, string | number>) => void;
};

const KIND_LABEL: Record<string, string> = {
  preparation: '准备',
  response: '回应',
  event: '插曲',
  bonus: '奖金',
  party: '庆功',
};

export function EndingView({ run, content, onReplay, onHome, track }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const ending = content.endings.find((e) => e.id === run.endingId);
  if (!ending) return null;
  const shareText = shareCopy(run, content);
  const choices = keyChoices(run.history);
  const lastReview = run.reviews[run.reviews.length - 1];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied('ok');
      track('copy_result', { result: 'ok' });
    } catch {
      setCopied('fail');
      track('copy_result', { result: 'fail' });
    }
  };

  return (
    <div className="page">
      <h1 className="sr-only" ref={ref} tabIndex={-1}>
        结局：{ending.title}
      </h1>

      <div className="result-card" aria-label="结局卡">
        <img className="ending-stamp" src={stampUrl} alt="" aria-hidden="true" />
        <div className="rc-game">过稿模拟器</div>
        <div className="rc-ending">「{ending.title}」</div>
        <div className="rc-meta">
          提交 {run.submittedCount} 次｜最近等级 {gradeOrDash(run)}｜游戏内奖金{' '}
          {run.bonus?.cash ?? 0} 元
        </div>
        <p className="rc-quote">「{ending.body.slice(0, 42)}……」</p>
      </div>

      <section className="card" aria-label="结局详情">
        <p style={{ margin: 0, fontSize: 15 }}>{ending.body}</p>
        <div className="hint-box" style={{ marginTop: 12 }}>
          <strong>复玩提示：</strong>
          {ending.hint}
        </div>
      </section>

      <section className="card" aria-label="关键选择">
        <p className="section-label">关键选择</p>
        <div className="key-choices">
          {choices.length === 0 ? <p className="brief-note">本局没有已结算的选择。</p> : null}
          {choices.map((entry) => {
            const label = contentLookupLabel(entry.kind, entry.itemId, entry.optionId, content);
            return (
              <div className="kc-item" key={entry.seq}>
                <span className="kc-round">第 {entry.round} 轮</span>
                <span>
                  {KIND_LABEL[entry.kind] ?? entry.kind}：{label}
                </span>
                <span className="kc-delta">{describeDelta(entry.before, entry.after)}</span>
              </div>
            );
          })}
        </div>
        <details className="full-record" style={{ marginTop: 8 }}>
          <summary>查看完整记录</summary>
          <ul>
            {run.history.map((entry) => (
              <li key={entry.seq}>
                #{entry.seq} 第 {entry.round} 轮 {KIND_LABEL[entry.kind] ?? entry.kind}：
                {contentLookupLabel(entry.kind, entry.itemId, entry.optionId, content)}——{entry.resultText}
              </li>
            ))}
          </ul>
          <p>
            最近一次评审：
            {lastReview
              ? ` 第 ${lastReview.round} 轮 ${lastReview.score} 分（${lastReview.grade}）`
              : ' 尚未提交'}
          </p>
        </details>
      </section>

      <button type="button" className="btn btn-primary btn-block" onClick={onReplay}>
        再玩一局
      </button>
      <div className="btn-row">
        <button type="button" className="btn" onClick={copy}>
          复制结果
        </button>
        <button type="button" className="btn" onClick={onHome}>
          回首页
        </button>
      </div>
      <div aria-live="polite">
        {copied === 'ok' ? <div className="notice info">已复制到剪贴板。</div> : null}
        {copied === 'fail' ? (
          <div className="notice warn">
            <p>复制失败，请手动选中下面文本复制：</p>
            <textarea className="copy-fallback" readOnly value={shareText} onFocus={(e) => e.target.select()} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function contentLookupLabel(
  kind: string,
  itemId: string,
  optionId: string | undefined,
  content: GameContent,
): string {
  if (kind === 'preparation') {
    return content.preparations.find((p) => p.id === itemId)?.name ?? itemId;
  }
  if (kind === 'response') {
    return content.responses.find((r) => r.id === itemId)?.name ?? itemId;
  }
  if (kind === 'event') {
    const event = content.events.find((e) => e.id === itemId);
    const option = event?.options.find((o) => o.id === optionId);
    return option ? `${event?.title}：${option.name}` : event?.title ?? itemId;
  }
  if (kind === 'bonus') {
    return itemId === 'negotiate' ? '凭记录谈分成' : '接受分配';
  }
  if (kind === 'party') {
    return itemId === 'self' ? '自己先领红包' : '请老板先来';
  }
  if (kind === 'quit') return '主动下班';
  return itemId;
}

function describeDelta(before: Run['stats'], after: Run['stats']): string {
  const parts: string[] = [];
  for (const key of ['quality', 'trust', 'energy', 'evidence', 'scopeDebt'] as const) {
    const d = after[key] - before[key];
    if (d !== 0) parts.push(`${d > 0 ? '+' : ''}${d}`);
  }
  return parts.length > 0 ? parts.join(' ') : '—';
}
