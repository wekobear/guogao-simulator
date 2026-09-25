import type { GameContent, Run } from '../game/types';
import { lastPreparationId } from '../game/selectors';
import type { PickedImage } from '../services/images';

const FX_NAME: Record<string, string> = {
  improve: '已强化排版',
  clarify: '已核对需求',
  motion: '已加动效标记',
  align: '已对齐版式',
  rest: '',
};

type Props = {
  run: Run;
  content: GameContent;
  customImage: PickedImage | null;
  onZoom?: () => void;
};

/**
 * 稿件预览：有自选图时显示原图（不改稿、不评分），
 * 否则显示按模板 + 最近一次准备动作微调的 CSS 内置稿件（DTC 独立站上新落地页示意）。
 */
export function DraftPreview({ run, content, customImage, onZoom }: Props) {
  const template = content.templates.find((t) => t.id === run.templateId) ?? content.templates[0]!;
  const fx = lastPreparationId(run);

  if (customImage) {
    return (
      <div className="draft-wrap">
        <img
          src={customImage.url}
          alt="你选择的稿件（仅本机展示，不参与评分）"
          className="draft-custom"
          onClick={onZoom}
          style={{ cursor: onZoom ? 'zoom-in' : undefined }}
        />
        {fx && FX_NAME[fx] ? <span className="prep-label">{FX_NAME[fx]}</span> : null}
        <p className="draft-hint">自选图片仅本地展示；准备动作改变的是策略数值，不代表已自动改图。</p>
      </div>
    );
  }

  return (
    <div className="draft-wrap">
      <div className="draft-frame" data-template={template.id} data-fx={fx ?? undefined}>
        <div className="draft-head">
          <span>石影 · DTC 上新落地页</span>
          <span>内置示例稿</span>
        </div>
        <div className="draft-inner">
          <p className="draft-sub">新品首发 · 石影 X1 运动相机</p>
          <h3 className="draft-title">每一跳{'\u3000'}都稳。</h3>
          {fx === 'clarify' ? (
            <div className="draft-checklist" aria-hidden="true">
              <span className="draft-check">✓ 产品主视觉</span>
              <span className="draft-check">✓ 首发权益</span>
              <span className="draft-check">✓ 购买按钮</span>
            </div>
          ) : null}
          {fx === 'motion' ? (
            <div className="draft-motion-badges" aria-hidden="true">
              <span className="draft-motion-badge">首屏滚动动效</span>
              <span className="draft-motion-badge">按钮呼吸</span>
            </div>
          ) : null}
          <div className="gears">
            <div className="gear">
              <span className="glyph-camera" aria-hidden="true">
                <span className="cam-lens" />
                <span className="cam-rec" />
              </span>
              <span className="gear-label">石影 X1（指定产品）</span>
            </div>
            <div className="gear">
              <div className="spec-chips" aria-hidden="true">
                <span className="spec-chip">4K·60</span>
                <span className="spec-chip">防抖 3.0</span>
                <span className="spec-chip">10m 防水</span>
              </div>
              <span className="gear-label">核心参数（不可替换）</span>
            </div>
          </div>
          <span className="draft-offer">首发享权益</span>
          <button type="button" className="draft-cta" tabIndex={-1} aria-hidden="true">
            立即购买
          </button>
        </div>
      </div>
      <p className="draft-hint">内置示例稿：程序绘制，仅用于示意，不含真实价格承诺。</p>
    </div>
  );
}
