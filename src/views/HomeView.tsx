import type { GameContent } from '../game/types';
import { useViewFocus } from './useViewFocus';

type Props = {
  content: GameContent;
  hasContinue: boolean;
  reduceMotion: boolean;
  onNew: () => void;
  onContinue: () => void;
  storageWarning: string | null;
};

/**
 * 首页（v0.3.0）：全屏办公室场景直接做背景（全局 OfficeBackdrop，title 模式
 * 带缓慢漂移与走道踱步），本视图只叠左/中层级 logo、极短开场文案与行动按钮，
 * 不再出现独立小场景卡片，也没有大片黑空白。
 */
export function HomeView({ content, hasContinue, onNew, onContinue, storageWarning }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  return (
    <div className="page home-full">
      <div className="home-heading">
        <h1 className="home-title" ref={ref} tabIndex={-1}>
          过稿模拟器
        </h1>
        <p className="home-chapter">差不多创意部 · 傍晚 · 周四 18:47</p>
        <p className="home-tagline">稿子可以再改，今天还想准点走。</p>
      </div>
      <div className="home-rules">
        <span className="chip">最多提交三次</span>
        <span className="chip">选择影响过稿与结局</span>
        <span className="chip">一局约 3–5 分钟</span>
      </div>
      <div className="home-actions">
        {hasContinue ? (
          <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
            继续改稿
          </button>
        ) : null}
        <button
          type="button"
          className={`btn btn-block${hasContinue ? '' : ' btn-primary'}`}
          onClick={onNew}
        >
          新开一单
        </button>
      </div>
      {storageWarning ? <div className="notice warn">{storageWarning}</div> : null}
      <p className="home-foot">
        <span>{content.config.company} · 虚构剧情</span>
        <span>所有奖金均为游戏内虚构数字</span>
      </p>
    </div>
  );
}
