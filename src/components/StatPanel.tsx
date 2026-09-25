import type { Stats } from '../game/types';
import { STAT_KEYS, STAT_LABELS } from '../game/selectors';

/** 五项指标；变化以文字呈现，不只靠颜色 */
export function StatPanel({ stats, compact = false }: { stats: Stats; compact?: boolean }) {
  return (
    <div className="stats-panel" aria-label="本局指标">
      {STAT_KEYS.map((key) => {
        if (key === 'scopeDebt') {
          return (
            <div key={key} className="stat-row stat-scope">
              <span className="stat-name">{STAT_LABELS[key]}</span>
              <span className="stat-bar" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`dot${i < stats.scopeDebt ? ' on' : ''}`} />
                ))}
              </span>
              <span className="stat-value">
                {stats.scopeDebt} 点{compact ? '' : '｜每点扣 5 分'}
              </span>
            </div>
          );
        }
        const value = stats[key];
        const tone =
          key === 'trust' ? 'green' : key === 'energy' && value <= 20 ? 'red' : key === 'evidence' ? 'amber' : 'ink';
        return (
          <div key={key} className="stat-row">
            <span className="stat-name">{STAT_LABELS[key]}</span>
            <span className="stat-bar" aria-hidden="true">
              <span
                className="stat-fill"
                data-tone={tone}
                style={{ width: `${value}%` }}
              />
            </span>
            <span className="stat-value">
              {value}
              <span className="sr-only"> / 100</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
