import { GalleryIcon, HelpCircleIcon, SettingsIcon } from './icons';
import { STAT_LABELS } from '../game/selectors';
import type { Stats } from '../game/types';

type Props = {
  /** 已在首页时传 null：品牌仅作标识，不渲染成可点入口 */
  onHome: (() => void) | null;
  onHowTo: () => void;
  onCollection: () => void;
  onSettings: () => void;
  company: string;
  /** 局内任务文案（无 run 时显示章节语） */
  taskText: string;
  /** 第几次提交（无 run 时 null） */
  round: number | null;
  stats: Stats | null;
};

/** 状态条只保留四条主指标；额外承诺以红点行尾徽标呈现 */
const HUD_STAT_KEYS = ['quality', 'trust', 'energy', 'evidence'] as const;

/** 四条主指标各自固定色相，一眼可分：准备度绿 / 信任珊瑚红 / 精力金黄 / 凭证暖橙 */
const HUD_STAT_TONE: Record<(typeof HUD_STAT_KEYS)[number], string> = {
  quality: 'green',
  trust: 'coral',
  energy: 'gold',
  evidence: 'orange',
};

/**
 * 全局游戏 HUD（v0.3.0，参考 Pixel Office Game UI Asset Sheet 顶栏）：
 * 左金色中文 logo + 英文副标 / 周四 18:47 / 公司；中琥珀任务与提交次数 + 四条细状态条；
 * 右玩法 / 图鉴 / 设置线条图标（Reicon）。移动端折两层：品牌工具行 + 任务指标行。
 */
export function GameHud({
  onHome,
  onHowTo,
  onCollection,
  onSettings,
  company,
  taskText,
  round,
  stats,
}: Props) {
  return (
    <header className="game-hud" data-round={round ?? 'none'}>
      <div className="hud-left">
        {onHome ? (
          <button type="button" className="hud-brand" onClick={onHome} aria-label="回首页（保留当前进度）">
            过稿模拟器
          </button>
        ) : (
          <span className="hud-brand" aria-hidden="true">
            过稿模拟器
          </span>
        )}
        <span className="hud-sub">GUOGAO SIMULATOR</span>
        <span className="hud-meta">
          周四 18:47 · {company}
        </span>
      </div>

      <div className="hud-mid">
        <div className="hud-task">
          <span className="hud-task-label">{taskText}</span>
          {round !== null ? (
            <span className="hud-round">
              第 {round}/3 次提交
              <span className="hud-round-dots" aria-hidden="true">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={`hud-dot${i < round ? ' done' : ''}`} />
                ))}
              </span>
            </span>
          ) : null}
        </div>
        {stats ? (
          <div className="hud-stats" aria-label="本局指标速览">
            {HUD_STAT_KEYS.map((key) => (
              <span className="hud-stat" key={key}>
                <span className="hud-stat-name">{STAT_LABELS[key]}</span>
                <span className="hud-stat-bar">
                  <span
                    className="hud-stat-fill"
                    data-tone={HUD_STAT_TONE[key]}
                    style={{ width: `${Math.max(0, Math.min(100, stats[key]))}%` }}
                  />
                </span>
                <span className="hud-stat-value">{stats[key]}</span>
              </span>
            ))}
            <span className="hud-stat hud-stat-scope" title="额外承诺">
              <span className="hud-stat-name">承诺</span>
              <span className={`hud-scope-dots${stats.scopeDebt > 0 ? ' bad' : ''}`} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`hud-scope-dot${i < stats.scopeDebt ? ' on' : ''}`} />
                ))}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <nav className="hud-tools" aria-label="全局工具">
        <button type="button" className="hud-tool" onClick={onHowTo} aria-label="玩法说明" title="玩法说明">
          <HelpCircleIcon />
          <span className="hud-tool-label" aria-hidden="true">
            玩法
          </span>
        </button>
        <button type="button" className="hud-tool" onClick={onCollection} aria-label="结局图鉴" title="结局图鉴">
          <GalleryIcon />
          <span className="hud-tool-label" aria-hidden="true">
            图鉴
          </span>
        </button>
        <button type="button" className="hud-tool" onClick={onSettings} aria-label="设置" title="设置">
          <SettingsIcon />
          <span className="hud-tool-label" aria-hidden="true">
            设置
          </span>
        </button>
      </nav>
    </header>
  );
}
