import { useEffect, useRef } from 'react';
import type { GameContent } from '../game/types';
import { useViewFocus } from './useViewFocus';
import heroUrl from '../assets/hero.svg';

type Props = {
  content: GameContent;
  hasContinue: boolean;
  onNew: () => void;
  onContinue: () => void;
  onHowTo: () => void;
  onCollection: () => void;
  onSettings: () => void;
  storageWarning: string | null;
};

export function HomeView({
  content,
  hasContinue,
  onNew,
  onContinue,
  onHowTo,
  onCollection,
  onSettings,
  storageWarning,
}: Props) {
  const ref = useViewFocus<HTMLHeadingElement>();
  const heroRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // 装饰插画加载失败（资源缺失）时直接隐藏，不显示破图
    const img = heroRef.current;
    if (!img) return;
    const hide = () => img.remove();
    img.addEventListener('error', hide);
    return () => img.removeEventListener('error', hide);
  }, []);
  return (
    <div className="page home">
      <div>
        <h1 className="home-title" ref={ref} tabIndex={-1}>
          过稿模拟器
        </h1>
        <p className="home-tagline">稿子可以再改，今天还想准点走。</p>
      </div>
      <img ref={heroRef} className="home-hero" src={heroUrl} alt="" aria-hidden="true" />
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
        <div className="btn-row">
          <button type="button" className="btn" onClick={onHowTo}>
            玩法说明
          </button>
          <button type="button" className="btn" onClick={onCollection}>
            结局图鉴
          </button>
          <button type="button" className="btn" onClick={onSettings}>
            设置
          </button>
        </div>
      </div>
      {storageWarning ? <div className="notice warn">{storageWarning}</div> : null}
      <p className="home-foot">
        <span>{content.config.company} · 虚构剧情</span>
        <span>所有奖金均为游戏内虚构数字</span>
      </p>
    </div>
  );
}
