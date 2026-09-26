import type { GameContent } from '../game/types';
import { STAT_LABELS, STAT_KEYS } from '../game/selectors';
import type { Stats } from '../game/types';
import { useViewFocus } from './useViewFocus';

type Props = {
  content: GameContent;
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  sketchSelected: boolean;
  onSelectSketch: () => void;
  onStart: () => void;
  onBack: () => void;
};

function statsLine(stats: Stats): string {
  return STAT_KEYS.map((key) => `${STAT_LABELS[key]} ${stats[key]}`).join('·');
}

export function BriefView({
  content,
  selectedTemplateId,
  onSelectTemplate,
  sketchSelected,
  onSelectSketch,
  onStart,
  onBack,
}: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const brief = content.config.brief;
  return (
    <div className="page">
      <h1 className="view-title" ref={ref} tabIndex={-1}>
        本单需求
      </h1>
      <p className="view-sub">
        {brief.brand}｜{brief.title}
      </p>

      <section className="card" aria-label="正式需求">
        <p className="section-label">正式需求（固定不变）</p>
        <ol className="brief-lines">
          {brief.requirementLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>

      <section className="boss-note" aria-label="老板追加要求">
        <strong>{content.config.boss.name}追加：</strong>「{brief.bossExtra}」
      </section>
      <p className="brief-note">{brief.deliverableNote}</p>

      <section aria-label="选择起手方案">
        <p className="section-label">起手方案（三选一，或选认真模式）</p>
        <div className="templates" role="group" aria-label="起手方案">
          {content.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-card"
              aria-pressed={selectedTemplateId === t.id}
              onClick={() => onSelectTemplate(t.id)}
            >
              <span className="template-name">{t.name}</span>
              <div className="template-tag">{t.tagline}</div>
              <p className="template-desc">{t.description}</p>
              <div className="template-stats">
                <span>{statsLine(t.stats)}</span>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="template-card sketch-card"
            aria-pressed={sketchSelected}
            onClick={onSelectSketch}
          >
            <span className="template-name">亲手画原型</span>
            <div className="template-tag">认真模式 · M3E 画布</div>
            <p className="template-desc">
              以常规卡片为底稿：第一轮在画布上亲手拼首屏——主视觉、立即购买、手机竖屏……雕茅经理会拿需求逐条对。
            </p>
            <div className="template-stats">
              <span>底稿＝常规卡片 · 原型结构计入本局指标</span>
            </div>
          </button>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!selectedTemplateId}
        onClick={onStart}
      >
        开始这单
      </button>
      {!selectedTemplateId ? (
        <p className="brief-note" role="status">
          先在上面选一个起手方案
        </p>
      ) : null}
      <button type="button" className="btn btn-ghost" onClick={onBack}>
        返回首页
      </button>
    </div>
  );
}
