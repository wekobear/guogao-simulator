import type { StatsDelta } from '../game/types';
import { previewChange, willExhaustEnergy } from '../game/selectors';
import type { Stats } from '../game/types';

type Props = {
  name: string;
  description: string;
  deltas: StatsDelta;
  stats: Stats;
  selected: boolean;
  onSelect: () => void;
  showWarn?: boolean;
};

/** 单选式选项卡：展示说明 + 截断后的实际数值变化 */
export function OptionCard({ name, description, deltas, stats, selected, onSelect, showWarn = true }: Props) {
  const { changes } = previewChange(stats, deltas);
  const exhaust = showWarn && willExhaustEnergy(stats, deltas);
  return (
    <button type="button" className="option-card" aria-pressed={selected} onClick={onSelect}>
      <span className="option-head">
        <span className="option-name">{name}</span>
        <span className="option-preview">
          {changes.map((c, i) => (
            <span key={c.key} className={c.delta < 0 ? 'neg' : 'pos'}>
              {i > 0 ? '，' : ''}
              {c.delta > 0 ? '+' : ''}
              {c.delta}
            </span>
          ))}
          {changes.length === 0 ? <span className="pos">无变化</span> : null}
        </span>
      </span>
      <span className="option-desc">{description}</span>
      {exhaust ? <span className="option-warn">注意：此操作将导致精力耗尽，直接结算结局。</span> : null}
    </button>
  );
}
