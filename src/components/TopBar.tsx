import { GalleryIcon, HelpCircleIcon, SettingsIcon } from './icons';

type Props = {
  /** 已在首页时传 null：品牌仅作标识，不渲染成可点入口 */
  onHome: (() => void) | null;
  onHowTo: () => void;
  onCollection: () => void;
  onSettings: () => void;
};

/** 统一顶栏：左侧品牌入口 + 右侧「玩法说明 / 结局图鉴 / 设置」三个图标工具按钮 */
export function TopBar({ onHome, onHowTo, onCollection, onSettings }: Props) {
  return (
    <header className="topbar">
      {onHome ? (
        <button type="button" className="brand" onClick={onHome} aria-label="回首页（保留当前进度）">
          过稿模拟器
        </button>
      ) : (
        <span className="brand" aria-hidden="true">
          过稿模拟器
        </span>
      )}
      <nav className="topbar-actions" aria-label="全局工具">
        <button type="button" className="topbar-tool" onClick={onHowTo} aria-label="玩法说明" title="玩法说明">
          <HelpCircleIcon />
          <span className="topbar-tool-label" aria-hidden="true">
            玩法
          </span>
        </button>
        <button
          type="button"
          className="topbar-tool"
          onClick={onCollection}
          aria-label="结局图鉴"
          title="结局图鉴"
        >
          <GalleryIcon />
          <span className="topbar-tool-label" aria-hidden="true">
            图鉴
          </span>
        </button>
        <button type="button" className="topbar-tool" onClick={onSettings} aria-label="设置" title="设置">
          <SettingsIcon />
          <span className="topbar-tool-label" aria-hidden="true">
            设置
          </span>
        </button>
      </nav>
    </header>
  );
}
