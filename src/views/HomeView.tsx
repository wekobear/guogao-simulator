import type { GameContent } from '../game/types';
import { useViewFocus } from './useViewFocus';
import { OfficeStage } from '../components/office/OfficeStage';

type Props = {
  content: GameContent;
  hasContinue: boolean;
  reduceMotion: boolean;
  onNew: () => void;
  onContinue: () => void;
  storageWarning: string | null;
};

export function HomeView({ content, hasContinue, reduceMotion, onNew, onContinue, storageWarning }: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  return (
    <div className="page home home-stage">
      <div className="home-heading">
        <h1 className="home-title" ref={ref} tabIndex={-1}>
          过稿模拟器
        </h1>
        <p className="home-chapter">差不多创意部 · 傍晚 · 周四 18:47</p>
        <p className="home-tagline">稿子可以再改，今天还想准点走。</p>
      </div>
      <div className="home-stage-wrap">
        <OfficeStage mode="title" reduceMotion={reduceMotion} className="office-canvas home-canvas" />
        <p className="home-stage-cap" aria-hidden="true">
          差不多创意部 · 赶在日落前把稿子再过一遍
        </p>
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
