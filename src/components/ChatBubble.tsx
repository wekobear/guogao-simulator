import type { GameContent } from '../game/types';

export function ChatBubble({
  actor,
  children,
  content,
}: {
  actor: 'boss' | 'self';
  children: React.ReactNode;
  content: GameContent;
}) {
  const isBoss = actor === 'boss';
  return (
    <div className={`bubble-row${isBoss ? '' : ' self'}`}>
      <span className={`avatar ${isBoss ? 'boss' : 'self'}`} aria-hidden="true">
        {isBoss ? content.config.boss.avatarChar : content.config.playerAvatarChar}
      </span>
      <div className="bubble">
        <div className="bubble-actor">{isBoss ? content.config.boss.name : '我'}</div>
        {children}
      </div>
    </div>
  );
}

/** 圆形印章（CSS 绘制） */
export function Seal({
  text,
  pass = false,
  large = false,
}: {
  text: string;
  pass?: boolean;
  large?: boolean;
}) {
  return (
    <span className={`seal${pass ? ' pass' : ''}${large ? ' lg' : ''}`} aria-hidden="true">
      {text}
    </span>
  );
}
