import { useEffect, useState } from 'react';
import type { GameContent } from '../game/types';
import { seedSketchCanvas } from '../services/canvas';

type Props = {
  content: GameContent;
  onClose: () => void;
};

/**
 * 全屏原型画布：同源 iframe 加载 public/canvas/（vendor/m3e-canvas 静态构建）。
 * 种子在 iframe 挂载前写入其读取的 localStorage key，见 services/canvas.ts。
 */
export function SketchCanvas({ content, onClose }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    seedSketchCanvas(content.config.brief.requirementLines);
    setReady(true);
  }, [content]);

  if (!ready) return null;
  return (
    <div className="sketch-overlay" role="dialog" aria-label="原型画布">
      <div className="sketch-topbar">
        <div className="sketch-req" aria-label="需求速览">
          {content.config.brief.requirementLines.map((line) => (
            <span key={line} className="chip">
              {line}
            </span>
          ))}
        </div>
        <button type="button" className="btn" onClick={onClose}>
          收起画布
        </button>
      </div>
      <iframe src="canvas/" title="M3E 原型画布" className="sketch-frame" />
    </div>
  );
}
