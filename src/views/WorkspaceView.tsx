import { useRef, useState } from 'react';
import type { GameContent, Run } from '../game/types';
import type { PickedImage } from '../services/images';
import { pickImage, revokeImage } from '../services/images';
import { StatPanel } from '../components/StatPanel';
import { DraftPreview } from '../components/DraftPreview';
import { OptionCard } from '../components/OptionCard';
import { ResultBanner } from '../components/ResultBanner';
import { useViewFocus } from './useViewFocus';
import { SketchCanvas } from '../components/SketchCanvas';
import { readSketchDoc } from '../services/canvas';

type Props = {
  run: Run;
  content: GameContent;
  customImage: PickedImage | null;
  onImageChange: (image: PickedImage | null) => void;
  onZoomImage: () => void;
  onSubmitPrep: (prepId: string) => void;
  onSubmitSketch: (doc: unknown) => void;
  onQuit: () => void;
  imageRestored: boolean;
};

export function WorkspaceView({
  run,
  content,
  customImage,
  onImageChange,
  onZoomImage,
  onSubmitPrep,
  onSubmitSketch,
  onQuit,
  imageRestored,
}: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [hasOpenedCanvas, setHasOpenedCanvas] = useState(false);
  const lastEntry = run.history[run.history.length - 1];
  const showBanner = run.round >= 2 && lastEntry?.kind === 'event';
  const sketchRound = run.sketchMode === true && run.round === 1 && !run.sketch;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    setImageBusy(true);
    try {
      const picked = await pickImage(file);
      const old = customImage;
      onImageChange(picked);
      if (old) revokeImage(old.url);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '图片处理失败，请换一张试试。');
    } finally {
      setImageBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = () => {
    if (customImage) revokeImage(customImage.url);
    onImageChange(null);
    setImageError(null);
  };

  return (
    <div className="page wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h1 className="view-title" ref={ref} tabIndex={-1}>
          工作台
        </h1>
        <span className="round-badge">
          第 {run.round} 次提交
          <span className="round-dots" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <span key={i} className={`round-dot${i < run.round ? ' done' : ''}`} />
            ))}
          </span>
          / 3
        </span>
      </div>

      {showBanner && lastEntry ? <ResultBanner entry={lastEntry} /> : null}
      {imageRestored && customImage === null ? (
        <div className="notice info">进度已恢复，图片需重新选择。</div>
      ) : null}

      <div className="workspace-grid">
        <section aria-label="稿件预览">
          <DraftPreview
            run={run}
            content={content}
            customImage={customImage}
            onZoom={customImage ? onZoomImage : undefined}
          />
          <div className="draft-toolbar">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => void handleFile(e.target.files?.[0])}
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              className="btn"
              disabled={imageBusy}
              onClick={() => fileRef.current?.click()}
            >
              {customImage ? '换一张图' : '放入我的稿子'}
            </button>
            {customImage ? (
              <>
                <button type="button" className="btn" onClick={onZoomImage}>
                  放大查看
                </button>
                <button type="button" className="btn" onClick={removeImage}>
                  移除，用内置稿
                </button>
              </>
            ) : null}
          </div>
          {imageBusy ? <p className="draft-hint">正在处理图片……</p> : null}
          {imageError ? (
            <div className="notice error" role="alert">
              {imageError}
            </div>
          ) : null}
          <p className="draft-hint">
            自选图仅在本机展示，不上传、不参与评分，也不改变随机结果；支持 JPEG / PNG / WebP，≤ 8 MiB。
          </p>
        </section>

        <section className="card" aria-label="本局指标">
          <StatPanel stats={run.stats} />
        </section>
      </div>

      {sketchRound ? (
        <section className="card" aria-label="画原型">
          <p className="section-label">认真模式：第一轮亲手画原型</p>
          <p className="sketch-intro">
            以常规卡片为底稿。在画布上把「石影 X1」首屏拼出来：主视觉、立即购买、手机竖屏、页面导航、行为备注——引擎会按需求逐条检查，计入本局指标。
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowCanvas(true);
                setHasOpenedCanvas(true);
              }}
            >
              {hasOpenedCanvas ? '回到画布继续画' : '打开画布画原型'}
            </button>
          </div>
          <p className="brief-note" role="status">
            {hasOpenedCanvas ? '画完收起画布，再点下方交稿。' : '先打开画布画点什么，再交稿。'}
          </p>
        </section>
      ) : (
        <section aria-label="准备动作">
          <p className="section-label">这一轮怎么处理（单选）</p>
          <div className="options">
          {content.preparations.map((prep) => (
            <OptionCard
              key={prep.id}
              name={prep.name}
              description={prep.description}
              deltas={prep.deltas}
              stats={run.stats}
              selected={selected === prep.id}
              onSelect={() => setSelected(prep.id)}
            />
          ))}
        </div>
      </section>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={sketchRound ? !hasOpenedCanvas : !selected}
        onClick={() => {
          if (sketchRound) {
            onSubmitSketch(readSketchDoc());
            return;
          }
          if (!selected) return;
          const id = selected;
          setSelected(null);
          onSubmitPrep(id);
        }}
      >
        {sketchRound ? '交稿评审（原型）' : '提交这一稿'}
      </button>
      {sketchRound ? (
        hasOpenedCanvas ? null : (
          <p className="brief-note" role="status">
            先打开画布画点什么
          </p>
        )
      ) : !selected ? (
        <p className="brief-note" role="status">
          先选一种处理方式
        </p>
      ) : null}
      <button type="button" className="btn btn-ghost" onClick={onQuit}>
        今天不干了（退出）
      </button>
      {showCanvas ? <SketchCanvas content={content} onClose={() => setShowCanvas(false)} /> : null}
    </div>
  );
}
