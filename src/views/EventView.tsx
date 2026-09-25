import type { GameContent, Run } from '../game/types';
import { currentEvent } from '../game/selectors';
import { OptionCard } from '../components/OptionCard';
import { ResultBanner } from '../components/ResultBanner';
import { useViewFocus } from './useViewFocus';

type Props = {
  run: Run;
  content: GameContent;
  onChoose: (optionId: string) => void;
};

export function EventView({ run, content, onChoose }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const event = currentEvent(run, content);
  const lastEntry = run.history[run.history.length - 1];
  if (!event) return null;
  return (
    <div className="page">
      <h1 className="view-title" ref={ref} tabIndex={-1}>
        职场插曲 · {event.title}
      </h1>
      {lastEntry?.kind === 'response' ? <ResultBanner entry={lastEntry} /> : null}

      <section className="card" aria-label="插曲场景">
        <p style={{ margin: 0 }}>{event.scene}</p>
      </section>

      <section aria-label="插曲选项">
        <p className="section-label">你怎么办（立即结算）</p>
        <div className="options">
          {event.options.map((opt) => (
            <OptionCard
              key={opt.id}
              name={opt.name}
              description={opt.description}
              deltas={opt.deltas}
              stats={run.stats}
              selected={false}
              onSelect={() => onChoose(opt.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
