import type { GameContent } from '../game/types';
import { Modal } from './Modal';
import { STAT_LABELS } from '../game/selectors';

export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="玩法说明" onClose={onClose} footer={<button className="btn btn-primary btn-block" onClick={onClose}>知道了</button>}>
      <section>
        <h3>一局怎么玩</h3>
        <ul>
          <li>你是运动相机品牌「石影」的设计师，为 DTC 独立站出一版新品落地页，目标是过稿。</li>
          <li>一局最多提交三次：初稿一次，退回后最多再改两次。</li>
          <li>每轮先选一个准备动作，再提交；退回后要回应老板，然后处理一个职场插曲。</li>
        </ul>
      </section>
      <section>
        <h3>过稿指数怎么算</h3>
        <ul>
          <li>过稿指数 = 60%×稿件准备度 + 25%×老板信任 + 15%×沟通凭证 − 每点额外承诺扣 5 分。</li>
          <li>
            通过需要：指数 ≥ 65，且{STAT_LABELS.trust} ≥ 40，且（
            {STAT_LABELS.evidence} ≥ 20 或 {STAT_LABELS.trust} ≥ 75）。
          </li>
          <li>{STAT_LABELS.energy}归零会当场燃尽结束；第三次退回时信任过低会被开除。</li>
          <li>过稿后进入分奖金：凭证和信任都够 40，可以凭记录把分成谈回 75%。</li>
        </ul>
      </section>
      <section>
        <h3>其他</h3>
        <ul>
          <li>指数按本局选择计算，不代表真实作品水平。</li>
          <li>选填的本地图片只在你设备上展示，不上传、不参与评分。</li>
          <li>进度自动保存在本浏览器；同一局请尽量在同一个标签页里玩。</li>
          <li>同一随机种子 + 同样的选择会得到同样的结局（开发模式可指定种子）。</li>
        </ul>
      </section>
    </Modal>
  );
}

export function CollectionModal({
  content,
  unlocked,
  onClose,
}: {
  content: GameContent;
  unlocked: Set<string>;
  onClose: () => void;
}) {
  return (
    <Modal title="结局图鉴" onClose={onClose} footer={<button className="btn btn-primary btn-block" onClick={onClose}>关闭</button>}>
      <div className="collection-grid">
        {content.endings.map((ending) => {
          const isUnlocked = unlocked.has(ending.id);
          return (
            <div key={ending.id} className={`ending-slot${isUnlocked ? ' unlocked' : ''}`}>
              {isUnlocked ? (
                <>
                  <span className="slot-title">{ending.title}</span>
                  <span className="slot-hint">{ending.hint.slice(0, 26)}…</span>
                </>
              ) : (
                <span className="slot-locked">未解锁</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="brief-note">已解锁 {unlocked.size} / 6。重开新局不影响图鉴。</p>
    </Modal>
  );
}

export function SettingsModal({
  reduceMotion,
  onReduceMotionChange,
  onClear,
  onClose,
}: {
  reduceMotion: boolean;
  onReduceMotionChange: (value: boolean) => void;
  onClear: (scope: 'run' | 'collection' | 'all') => void;
  onClose: () => void;
}) {
  return (
    <Modal title="设置" onClose={onClose} footer={<button className="btn btn-primary btn-block" onClick={onClose}>关闭</button>}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={reduceMotion}
          onChange={(e) => onReduceMotionChange(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        <span>减少动画（也自动跟随系统偏好）</span>
      </label>
      <section>
        <h3>清除数据（需二次确认）</h3>
        <div className="btn-row">
          <button type="button" className="btn btn-danger" onClick={() => onClear('run')}>
            清除当前局
          </button>
          <button type="button" className="btn btn-danger" onClick={() => onClear('collection')}>
            清除结局图鉴
          </button>
          <button type="button" className="btn btn-danger" onClick={() => onClear('all')}>
            全部清除
          </button>
        </div>
        <p className="brief-note">清除范围仅限本浏览器的《过稿模拟器》数据。</p>
      </section>
    </Modal>
  );
}

export function QuitConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal
      title="确认退出？"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onCancel}>
            再改改（取消）
          </button>
          <button type="button" className="btn btn-danger btn-block" onClick={onConfirm}>
            确认，今天不干了
          </button>
        </>
      }
    >
      <p>退出会以「主动下班」结束这一局，当前未提交的处理不会结算。确定吗？</p>
    </Modal>
  );
}

export function ImageViewerModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Modal title="查看图片" onClose={onClose}>
      <div className="image-viewer">
        <img src={url} alt="你的稿件（放大查看）" />
      </div>
      <p className="brief-note">仅浏览，不做编辑；图片不会离开你的设备。</p>
    </Modal>
  );
}

export function CorruptSaveModal({ onNewRun, onClose }: { onNewRun: () => void; onClose: () => void }) {
  return (
    <Modal
      title="存档无法继续"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onNewRun}>
            重新开局
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
            暂不处理
          </button>
        </>
      }
    >
      <p>这份存档无法继续（可能来自不兼容的版本）。可以重新开局；确认后当前局存档会被覆盖，结局图鉴保留。</p>
    </Modal>
  );
}

export function StaleTabNotice({
  onSync,
  onNew,
}: {
  onSync: () => void;
  onNew: () => void;
}) {
  return (
    <div className="notice warn" role="alert" style={{ margin: '0 16px' }}>
      检测到另一个标签页更新了这一局。为避免互相覆盖，本页已暂停操作。
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn" onClick={onSync}>
          从另一页同步
        </button>
        <button type="button" className="btn" onClick={onNew}>
          在本页新开一局
        </button>
      </div>
    </div>
  );
}

export function ClearConfirmModal({
  scope,
  onCancel,
  onConfirm,
}: {
  scope: 'run' | 'collection' | 'all';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const text =
    scope === 'run'
      ? '将清除当前局的进度（指标、评审、历史）。结局图鉴和其他设置不受影响。'
      : scope === 'collection'
        ? '将清空结局图鉴的解锁记录。当前局进度不受影响。'
        : '将清除当前局进度和结局图鉴。此操作不可恢复。';
  return (
    <Modal
      title="确认清除"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-danger btn-block" onClick={onConfirm}>
            确认清除
          </button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}
