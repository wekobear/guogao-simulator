import type { GameContent, Run } from '../game/types';
import { ChatBubble } from '../components/ChatBubble';
import { previewChange, STAT_LABELS } from '../game/selectors';
import { REASON_TEXT } from '../game/scoring';
import { useViewFocus } from './useViewFocus';

type Props = {
  run: Run;
  content: GameContent;
  onResponse: (id: string) => void;
  onQuit: () => void;
};

export function RespondView({ run, content, onResponse, onQuit }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const review = run.review;
  return (
    <div className="page">
      <h1 className="view-title" ref={ref} tabIndex={-1}>
        怎么回应？
      </h1>

      <section className="chat" aria-label="退回上下文">
        <ChatBubble actor="boss" content={content}>
          「{review ? review.text : '这版不行，再改改。'}」
        </ChatBubble>
        {review && review.reasonIds.length > 0 ? (
          <p className="view-sub">
            退回原因：{review.reasonIds.map((id) => REASON_TEXT[id]).join('；')}。
          </p>
        ) : null}
      </section>

      <section aria-label="回应方式">
        <p className="section-label">选一种回应（立即结算）</p>
        <div className="options">
          {content.responses.map((resp) => {
            const { changes } = previewChange(run.stats, resp.deltas);
            return (
              <button
                key={resp.id}
                type="button"
                className="option-card"
                onClick={() => onResponse(resp.id)}
              >
                <span className="option-head">
                  <span className="option-name">{resp.name}</span>
                </span>
                <span className="option-desc">{resp.description}</span>
                <span className="option-preview">
                  {changes.map((c, i) => (
                    <span key={c.key} className={c.delta < 0 ? 'neg' : 'pos'}>
                      {i > 0 ? '，' : ''}
                      {STAT_LABELS[c.key]}
                      {c.delta > 0 ? '+' : ''}
                      {c.delta}
                    </span>
                  ))}
                  {changes.length === 0 ? <span className="pos">数值不变</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <button type="button" className="btn btn-ghost" onClick={onQuit}>
        今天不干了（退出）
      </button>
    </div>
  );
}
