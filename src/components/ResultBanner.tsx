import type { LogEntry } from '../game/types';
import { formatChanges, previewChange } from '../game/selectors';

const KIND_LABEL: Record<string, string> = {
  preparation: '准备',
  response: '回应',
  event: '插曲',
  bonus: '奖金',
  party: '庆功',
  quit: '退出',
};

/** 上一步 resultText + 实际数值变化；保留到下一次选择完成 */
export function ResultBanner({ entry }: { entry: LogEntry }) {
  const changes = previewChange(entry.before, diffOf(entry)).changes;
  return (
    <div className="result-banner" role="status" aria-live="polite">
      <div className="rb-text">
        <strong>{KIND_LABEL[entry.kind] ?? entry.kind}：</strong>
        {entry.resultText}
      </div>
      <div className="rb-delta">{formatChanges(changes)}</div>
    </div>
  );
}

function diffOf(entry: LogEntry) {
  const delta: Record<string, number> = {};
  for (const key of ['quality', 'trust', 'energy', 'evidence', 'scopeDebt'] as const) {
    const d = entry.after[key] - entry.before[key];
    if (d !== 0) delta[key] = d;
  }
  return delta;
}
