import type { GameContent, Run } from '../game/types';
import { ResultBanner } from '../components/ResultBanner';
import { useViewFocus } from './useViewFocus';

type Props = {
  run: Run;
  content: GameContent;
  onChoose: (id: 'self' | 'boss') => void;
};

export function PartyView({ run, content, onChoose }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const cfg = content.config;
  const lastEntry = run.history[run.history.length - 1];
  const showBanner = lastEntry && lastEntry.kind === 'bonus';
  if (!run.bonus?.playerShare) return null;
  const base = run.bonus.cash;

  return (
    <div className="page">
      <h1 className="view-title" ref={ref} tabIndex={-1}>
        庆功红包
      </h1>
      {showBanner && lastEntry ? <ResultBanner entry={lastEntry} /> : null}

      <section className="card" aria-label="红包场景">
        <p style={{ margin: 0 }}>
          稿子过了。群里弹出一个庆功红包，{content.config.boss.name}的手指也在屏幕上悬着——谁先点？
        </p>
        <p className="brief-note">红包是剧情数值，不影响已经确定的分成。</p>
      </section>

      <section className="options" aria-label="红包选择">
        <button type="button" className="option-card" onClick={() => onChoose('self')}>
          <span className="option-head">
            <span className="option-name">自己先领红包</span>
            <span className="option-preview">
              <span className="pos">+{cfg.redPacket.self} {cfg.currency}</span>
            </span>
          </span>
          <span className="option-desc">手快有手慢无。到手 {base + cfg.redPacket.self} {cfg.currency}。</span>
        </button>
        <button type="button" className="option-card" onClick={() => onChoose('boss')}>
          <span className="option-head">
            <span className="option-name">请老板先来</span>
            <span className="option-preview">
              <span className="pos">+{cfg.redPacket.boss} {cfg.currency}</span>
            </span>
          </span>
          <span className="option-desc">会做人。到手 {base + cfg.redPacket.boss} {cfg.currency}。</span>
        </button>
      </section>
    </div>
  );
}
