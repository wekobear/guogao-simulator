import type { GameContent } from '../game/types';

type Props = {
  content: GameContent;
  onClose: () => void;
};

/**
 * 全屏原型画布：同源 iframe 加载 public/canvas/（vendor/m3e-canvas 静态构建）。
 * 打开前由 services/sketchDraft.ts 的 beginCanvasSession 把本局草稿（或种子）
 * 写进画布启动读取的 localStorage key（m3e:doc）——不再在挂载时无条件覆盖稿件。
 * 收起时由调用方 captureCanvasDraft 回读最新内容。
 */
/**
 * iframe 入口必须是显式的 canvas/index.html：dev 下相对地址 "canvas/" 会被解析到
 * 应用自己的首页（SPA 回退），相对路径在子路径部署时也会漂移。
 * 以 Vite BASE_URL 拼绝对路径，dev / preview / 子路径部署一致。
 */
function canvasEntryUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}canvas/index.html`;
}

export function SketchCanvas({ content, onClose }: Props) {
  return (
    <div className="sketch-overlay" role="dialog" aria-label="M3E 原型画布">
      <div className="sketch-topbar">
        <div className="sketch-req" aria-label="需求速览">
          {content.config.brief.requirementLines.map((line) => (
            <span key={line} className="chip">
              {line}
            </span>
          ))}
        </div>
        <button type="button" className="btn" onClick={onClose}>
          收起画布，回办公室
        </button>
      </div>
      <iframe src={canvasEntryUrl()} title="M3E 原型画布" className="sketch-frame" />
    </div>
  );
}
