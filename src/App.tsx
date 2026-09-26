import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameContent, Run } from './game/types';
import { loadContent } from './content/schema';
import { applyAction, createRun, envelope } from './game/reducer';
import { GameStorage, peekRunStamp, STORAGE_KEYS } from './services/storage';
import type { PickedImage } from './services/images';
import { revokeImage } from './services/images';
import { HomeView } from './views/HomeView';
import { BriefView } from './views/BriefView';
import { WorkspaceView } from './views/WorkspaceView';
import { ReviewView } from './views/ReviewView';
import { RespondView } from './views/RespondView';
import { EventView } from './views/EventView';
import { BonusView } from './views/BonusView';
import { PartyView } from './views/PartyView';
import { EndingView } from './views/EndingView';
import {
  ClearConfirmModal,
  CollectionModal,
  CorruptSaveModal,
  HowToPlayModal,
  ImageViewerModal,
  QuitConfirmModal,
  SettingsModal,
  StaleTabNotice,
} from './components/modals';

type Screen = 'home' | 'brief' | 'run';
type ModalKind =
  | 'howto'
  | 'collection'
  | 'settings'
  | 'quit'
  | 'image'
  | 'corrupt'
  | 'clear-run'
  | 'clear-collection'
  | 'clear-all'
  | null;

/** 开发/测试用：?seed=123 指定种子（生产不显示任何调试入口） */
const URL_SEED = (() => {
  try {
    const raw = new URLSearchParams(window.location.search).get('seed');
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? (n >>> 0) : null;
  } catch {
    return null;
  }
})();

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}

function track(event: string, payload?: Record<string, string | number>): void {
  if (import.meta.env.DEV) {
    console.debug('[track]', event, payload ?? {});
  }
}

export default function App() {
  const [content, setContent] = useState<GameContent | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [run, setRun] = useState<Run | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sketchMode, setSketchMode] = useState(false);
  const [customImage, setCustomImage] = useState<PickedImage | null>(null);
  const [imageRestored, setImageRestored] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [collection, setCollection] = useState<Set<string>>(new Set());
  const [reduceMotion, setReduceMotion] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [staleTab, setStaleTab] = useState(false);
  const [savedRunExists, setSavedRunExists] = useState(false);
  const storageRef = useRef<GameStorage | null>(null);
  const registeredEnding = useRef<string | null>(null);

  // 内容加载（失败可重试）
  const initContent = useCallback(() => {
    try {
      const loaded = loadContent() as GameContent;
      setContent(loaded);
      setContentError(null);
    } catch (err) {
      setContentError(err instanceof Error ? err.message : '内容加载失败');
    }
  }, []);
  useEffect(initContent, [initContent]);

  // 存档初始化
  useEffect(() => {
    if (!content) return;
    const storage = GameStorage.fromWindow(window);
    storageRef.current = storage;
    storage.onChangePersistent = (persistent) => {
      if (!persistent) setStorageWarning('当前浏览器无法保存，关闭后会丢失进度。');
    };
    if (!storage.persistent) setStorageWarning('当前浏览器无法保存，关闭后会丢失进度。');
    setCollection(new Set(storage.loadCollection()));
    setReduceMotion(storage.loadSettings().reduceMotion);
    const loaded = storage.loadRun(content);
    if (loaded.status === 'ok') {
      setSavedRunExists(true);
    } else if (loaded.status === 'corrupt') {
      setModal('corrupt');
    }
  }, [content]);

  // 多标签页：检测其他页面更新了存档
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.run) return;
      const stamp = peekRunStamp(e.newValue);
      if (!stamp || !run) return;
      if (stamp.runId !== run.runId || stamp.seq > run.seq) setStaleTab(true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [run]);

  // 局状态变化即保存
  useEffect(() => {
    if (!run || !storageRef.current || !content) return;
    storageRef.current.saveRun(run);
  }, [run, content]);

  // 结局登记（只登记一次）
  useEffect(() => {
    if (!run || run.phase !== 'ENDING' || !run.endingId) return;
    if (registeredEnding.current === run.runId + run.endingId) return;
    registeredEnding.current = run.runId + run.endingId;
    const storage = storageRef.current;
    if (storage) {
      const next = new Set(storage.loadCollection());
      next.add(run.endingId);
      storage.saveCollection([...next]);
      setCollection(next);
    }
    track('ending_reached', { ending: run.endingId });
  }, [run]);

  // reduceMotion 应用到根节点
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const act = useCallback(
    (
      type: Parameters<typeof envelope>[1],
      id?: string,
      extra?: { sketch?: { doc: unknown } },
    ) => {
      setRun((current) => {
        if (!current || !content || staleTab) return current;
        const nextRun = applyAction(current, envelope(current, type, id, extra), content);
        if (nextRun === current) return current;
        if (type === 'SUBMIT_PREP') track('choice_made', { kind: 'prep', id: id ?? '' });
        if (type === 'SUBMIT_SKETCH') track('choice_made', { kind: 'sketch' });
        if (nextRun.phase === 'REVIEW') track('review_complete', { round: nextRun.round });
        return nextRun;
      });
    },
    [content, staleTab],
  );

  const startRun = useCallback(
    (templateId: string) => {
      if (!content) return;
      const seed = URL_SEED ?? randomSeed();
      const fresh = createRun(seed, templateId, content, { sketch: sketchMode });
      if (customImage) revokeImage(customImage.url);
      setCustomImage(null);
      setImageRestored(false);
      setRun(fresh);
      setScreen('run');
      setSavedRunExists(true);
      track('game_start', { template: templateId, seed, sketch: sketchMode ? 1 : 0 });
    },
    [content, customImage, sketchMode],
  );

  const continueRun = useCallback(() => {
    if (!content || !storageRef.current) return;
    const loaded = storageRef.current.loadRun(content);
    if (loaded.status !== 'ok') {
      setModal('corrupt');
      return;
    }
    setImageRestored(loaded.run.hadCustomImage);
    setRun(loaded.run);
    setScreen('run');
  }, [content]);

  const replay = useCallback(() => {
    storageRef.current?.clearRun();
    setRun(null);
    setSavedRunExists(false);
    setSelectedTemplateId(null);
    setSketchMode(false);
    setScreen('brief');
  }, []);

  const goHome = useCallback(() => {
    setScreen('home');
  }, []);

  const handleImageChange = useCallback((image: PickedImage | null) => {
    setCustomImage(image);
    setRun((current) => (current ? { ...current, hadCustomImage: image !== null } : current));
  }, []);

  const handleClear = useCallback(
    (scope: 'run' | 'collection' | 'all') => {
      const storage = storageRef.current;
      if (!storage) return;
      if (scope === 'run' || scope === 'all') {
        storage.clearRun();
        setRun(null);
        setSavedRunExists(false);
        setScreen('home');
      }
      if (scope === 'collection' || scope === 'all') {
        storage.clearCollection();
        setCollection(new Set());
      }
      setModal(null);
    },
    [],
  );

  const syncFromOtherTab = useCallback(() => {
    if (!content || !storageRef.current) return;
    const loaded = storageRef.current.loadRun(content);
    setStaleTab(false);
    if (loaded.status === 'ok') {
      setRun(loaded.run);
      setImageRestored(loaded.run.hadCustomImage && customImage === null);
      setScreen('run');
    } else {
      setScreen('home');
    }
  }, [content, customImage]);

  // 离开页面时释放 Blob URL
  useEffect(() => {
    return () => {
      if (customImage) revokeImage(customImage.url);
    };
  }, [customImage]);

  const devPanel = useMemo(() => {
    if (!import.meta.env.DEV || !run) return null;
    return (
      <div className="dev-panel">
        <span>seed {run.seed}</span>
        <span>seq {run.seq} · rng {run.rngState}</span>
      </div>
    );
  }, [run]);

  if (contentError) {
    return (
      <div className="page" style={{ alignItems: 'center', paddingTop: 80 }}>
        <h1 className="view-title">内容加载失败</h1>
        <p className="view-sub">{contentError}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setContentError(null);
            initContent();
          }}
        >
          重试
        </button>
      </div>
    );
  }
  if (!content) return null;

  return (
    <div className="app-shell">
      {screen === 'run' && run ? (
        <header className="topbar">
          <button type="button" className="brand" onClick={goHome} aria-label="回首页（保留当前进度）">
            过稿模拟器
          </button>
          <div className="topbar-actions">
            <button type="button" className="btn" onClick={() => setModal('howto')}>
              玩法
            </button>
            <button type="button" className="btn" onClick={() => setModal('collection')}>
              图鉴
            </button>
          </div>
        </header>
      ) : null}

      {staleTab && screen === 'run' ? (
        <StaleTabNotice onSync={syncFromOtherTab} onNew={() => { setStaleTab(false); replay(); }} />
      ) : null}

      {screen === 'home' ? (
        <HomeView
          content={content}
          hasContinue={savedRunExists}
          onNew={() => {
            setSelectedTemplateId(null);
            setScreen('brief');
          }}
          onContinue={continueRun}
          onHowTo={() => setModal('howto')}
          onCollection={() => setModal('collection')}
          onSettings={() => setModal('settings')}
          storageWarning={storageWarning}
        />
      ) : null}

      {screen === 'brief' ? (
        <BriefView
          content={content}
          selectedTemplateId={selectedTemplateId}
          sketchSelected={sketchMode && selectedTemplateId === 'classic'}
          onSelectTemplate={(id) => {
            setSelectedTemplateId(id);
            setSketchMode(false);
          }}
          onSelectSketch={() => {
            setSelectedTemplateId('classic');
            setSketchMode(true);
          }}
          onStart={() => selectedTemplateId && startRun(selectedTemplateId)}
          onBack={goHome}
        />
      ) : null}

      {screen === 'run' && run && !staleTab ? (
        <>
          {run.phase === 'PREPARE' ? (
            <WorkspaceView
              run={run}
              content={content}
              customImage={customImage}
              onImageChange={handleImageChange}
              onZoomImage={() => setModal('image')}
              onSubmitPrep={(id) => act('SUBMIT_PREP', id)}
              onSubmitSketch={(doc) => act('SUBMIT_SKETCH', 'sketch', { sketch: { doc } })}
              onQuit={() => setModal('quit')}
              imageRestored={imageRestored}
            />
          ) : null}
          {run.phase === 'REVIEW' ? (
            <ReviewView run={run} content={content} onContinue={() => act('CONTINUE_REVIEW')} />
          ) : null}
          {run.phase === 'RESPOND' ? (
            <RespondView
              run={run}
              content={content}
              onResponse={(id) => act('CHOOSE_RESPONSE', id)}
              onQuit={() => setModal('quit')}
            />
          ) : null}
          {run.phase === 'EVENT' ? (
            <EventView run={run} content={content} onChoose={(id) => act('CHOOSE_EVENT_OPTION', id)} />
          ) : null}
          {run.phase === 'BONUS' ? (
            <BonusView run={run} content={content} onChoose={(id) => act('CHOOSE_BONUS', id)} />
          ) : null}
          {run.phase === 'PARTY' ? (
            <PartyView run={run} content={content} onChoose={(id) => act('CHOOSE_PARTY', id)} />
          ) : null}
          {run.phase === 'ENDING' ? (
            <EndingView run={run} content={content} onReplay={replay} onHome={goHome} track={track} />
          ) : null}
        </>
      ) : null}

      {modal === 'howto' ? <HowToPlayModal onClose={() => setModal(null)} /> : null}
      {modal === 'collection' ? (
        <CollectionModal content={content} unlocked={collection} onClose={() => setModal(null)} />
      ) : null}
      {modal === 'settings' ? (
        <SettingsModal
          reduceMotion={reduceMotion}
          onReduceMotionChange={(v) => {
            setReduceMotion(v);
            storageRef.current?.saveSettings({ reduceMotion: v });
          }}
          onClear={(scope) => {
            if (scope === 'run') setModal('clear-run');
            else if (scope === 'collection') setModal('clear-collection');
            else setModal('clear-all');
          }}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === 'clear-run' ? (
        <ClearConfirmModal
          scope="run"
          onCancel={() => setModal('settings')}
          onConfirm={() => handleClear('run')}
        />
      ) : null}
      {modal === 'clear-collection' ? (
        <ClearConfirmModal
          scope="collection"
          onCancel={() => setModal('settings')}
          onConfirm={() => handleClear('collection')}
        />
      ) : null}
      {modal === 'clear-all' ? (
        <ClearConfirmModal
          scope="all"
          onCancel={() => setModal('settings')}
          onConfirm={() => handleClear('all')}
        />
      ) : null}
      {modal === 'quit' ? (
        <QuitConfirmModal
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            act('CONFIRM_QUIT');
          }}
        />
      ) : null}
      {modal === 'image' && customImage ? (
        <ImageViewerModal url={customImage.url} onClose={() => setModal(null)} />
      ) : null}
      {modal === 'corrupt' ? (
        <CorruptSaveModal
          onNewRun={() => {
            storageRef.current?.clearRun();
            setSavedRunExists(false);
            setModal(null);
            setScreen('brief');
          }}
          onClose={() => setModal(null)}
        />
      ) : null}

      {devPanel}
    </div>
  );
}
