import type { GameContent, Run } from '../game/types';
import { negotiateCheck } from '../game/selectors';
import { ResultBanner } from '../components/ResultBanner';
import { useViewFocus } from './useViewFocus';

type Props = {
  run: Run;
  content: GameContent;
  onChoose: (id: 'accept' | 'negotiate') => void;
};

export function BonusView({ run, content, onChoose }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const cfg = content.config;
  if (!run.bonus) return null;
  const bossShare = run.bonus.initialBossShare;
  const playerShare = 100 - bossShare;
  const playerAmount = Math.round((cfg.bonusPool * playerShare) / 100);
  const { ok, missing } = negotiateCheck(run, content);
  const lastEntry = run.history[run.history.length - 1];
  const showBanner = lastEntry && lastEntry.kind === 'event';

  return (
    <div className="page">
      <h1 className="view-title" ref={ref} tabIndex={-1}>
        分奖金
      </h1>
      {showBanner && lastEntry ? <ResultBanner entry={lastEntry} /> : null}

      <section className="card" aria-label="奖金分配">
        <p className="section-label">奖金池 {cfg.bonusPool} {cfg.currency}</p>
        <table className="bonus-table">
          <thead>
            <tr>
              <th scope="col">项目</th>
              <th scope="col" className="num">
                比例 / 金额
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{content.config.boss.name}（起手分成）</td>
              <td className="num">
                {bossShare}%｜{cfg.bonusPool - playerAmount} {cfg.currency}
              </td>
            </tr>
            <tr>
              <td>你（当前份额）</td>
              <td className="num">
                {playerShare}%｜{playerAmount} {cfg.currency}
              </td>
            </tr>
            <tr className="total">
              <td>谈成后的份额</td>
              <td className="num">
                {cfg.negotiate.playerShare}%｜
                {Math.round((cfg.bonusPool * cfg.negotiate.playerShare) / 100)} {cfg.currency}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="options" aria-label="分配方式">
        <button type="button" className="option-card" onClick={() => onChoose('accept')}>
          <span className="option-head">
            <span className="option-name">接受分配</span>
          </span>
          <span className="option-desc">保住 {playerShare}%（{playerAmount} {cfg.currency}），皆大欢喜。</span>
        </button>
        <button
          type="button"
          className="option-card"
          disabled={!ok}
          onClick={() => onChoose('negotiate')}
        >
          <span className="option-head">
            <span className="option-name">凭记录谈分成（→ {cfg.negotiate.playerShare}%）</span>
          </span>
          <span className="option-desc">
            用这单留下的沟通记录，把你的份额谈回 {cfg.negotiate.playerShare}%。
          </span>
          {!ok ? (
            <span className="option-warn" role="note">
              还不能谈：{missing.join('；')}。
            </span>
          ) : null}
        </button>
      </section>
      <p className="brief-note">分成一经选定立即结算，只有一次。</p>
    </div>
  );
}
