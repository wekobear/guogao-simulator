import { useEffect, useRef, useState } from 'react';
import {
  PART_CATALOG,
  PART_ORDER,
  newPartId,
  type AssemblyPart,
  type AssemblyState,
  type PartKind,
} from '../game/pageDoc';

type Props = {
  state: AssemblyState;
  onChange: (next: AssemblyState) => void;
  requirementLines: string[];
  /** 当前稿件来自高级画布（无法反向转成拼装），给出明确出口 */
  fromCanvas: boolean;
  onOpenCanvas: () => void;
  onDiscardCanvas: () => void;
  onClose: () => void;
  storageWarning: boolean;
  reduceMotion?: boolean;
};

/** 品牌色预设：前四个在品牌橙距离阈值内，藏青是「跑偏」教学 */
const BRAND_SWATCHES = ['#FF5722', '#E64A19', '#F7B733', '#D9383A', '#1A237E', '#212121'];

type MobileTab = 'parts' | 'track' | 'preview';

/**
 * 场景内拼装编辑器（v0.3.0）：
 * PC 中央宽 workbench——左部件池 / 中实时稿件预览 / 右编排轨道（属性）；
 * 移动端全高 bottomsheet——顶把手 + 关闭，内部「部件 / 编排 / 预览」分层 tab 可滚，
 * 底部固定操作栏保存回办公室。增删重排、变体、品牌色、高级画布与确认逻辑全部保留。
 */
export function AssemblyEditor({
  state,
  onChange,
  requirementLines,
  fromCanvas,
  onOpenCanvas,
  onDiscardCanvas,
  onClose,
  storageWarning,
}: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [openPartId, setOpenPartId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [tab, setTab] = useState<MobileTab>('parts');
  const [reqOpen, setReqOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 打开即聚焦（键盘用户可直接操作，不抢输入框；overlay 全屏无需滚动定位）
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const addPart = (kind: PartKind) => {
    const def = PART_CATALOG[kind];
    const part: AssemblyPart = { id: newPartId(), kind, variant: def.variants[0]!.key };
    const next = { ...state, parts: [...state.parts, part] };
    onChange(next);
    setOpenPartId(part.id);
  };

  const patchPart = (id: string, patch: Partial<AssemblyPart>) => {
    onChange({ ...state, parts: state.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const removePart = (id: string) => {
    onChange({ ...state, parts: state.parts.filter((p) => p.id !== id) });
    if (openPartId === id) setOpenPartId(null);
  };

  const movePart = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= state.parts.length) return;
    const parts = [...state.parts];
    const [item] = parts.splice(index, 1);
    parts.splice(target, 0, item!);
    onChange({ ...state, parts });
  };

  const dropOn = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOver(null);
      return;
    }
    const parts = [...state.parts];
    const [item] = parts.splice(dragIndex, 1);
    parts.splice(index, 0, item!);
    onChange({ ...state, parts });
    setDragIndex(null);
    setDragOver(null);
  };

  const deviceSwitch = (extraClass: string) => (
    <div className={`asm-switch ${extraClass}`} role="group" aria-label="预览设备">
      <button
        type="button"
        className={device === 'desktop' ? 'on' : ''}
        aria-pressed={device === 'desktop'}
        onClick={() => setDevice('desktop')}
      >
        桌面
      </button>
      <button
        type="button"
        className={device === 'mobile' ? 'on' : ''}
        aria-pressed={device === 'mobile'}
        onClick={() => setDevice('mobile')}
      >
        手机
      </button>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="asm-editor"
      role="region"
      aria-label="落地页拼装编辑器"
      tabIndex={-1}
    >
      <div className="asm-head">
        <div className="asm-head-text">
          <p className="asm-title">设计工位 · 拼装落地页</p>
          <div className="asm-req-fold">
            <button
              type="button"
              className="asm-req-chip"
              aria-expanded={reqOpen}
              onClick={() => setReqOpen((v) => !v)}
            >
              需求 {requirementLines.length} 条{reqOpen ? ' · 收起' : ' · 展开'}
            </button>
            {reqOpen ? (
              <ol className="asm-req-lines">
                {requirementLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            ) : null}
          </div>
        </div>
        <div className="asm-head-actions">
          {deviceSwitch('asm-head-switch')}
          <button type="button" className="btn asm-close asm-close-desktop" onClick={onClose}>
            保存并回到办公室
          </button>
        </div>
      </div>

      <div className="asm-tabs" role="tablist" aria-label="编辑区分页">
        {(
          [
            ['parts', '部件'],
            ['track', `编排${state.parts.length > 0 ? ` · ${state.parts.length}` : ''}`],
            ['preview', '预览'],
          ] as [MobileTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`asm-tab${tab === key ? ' on' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {fromCanvas ? (
        <div className="asm-canvas-notice" role="status">
          当前稿件在高级画布（M3E）里。回到拼装会以空白重开，画布稿件在本局交稿前一直保留。
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button type="button" className="btn" onClick={onOpenCanvas}>
              打开高级画布继续
            </button>
            <button type="button" className="btn btn-danger" onClick={onDiscardCanvas}>
              以拼装重新开始
            </button>
          </div>
        </div>
      ) : (
        <div className="asm-body" data-tab={tab}>
          <section className="asm-dock" aria-label="部件池">
            <p className="asm-label">添加部件（按落地页从上到下拼）</p>
            <div className="asm-pool">
              {PART_ORDER.map((kind) => (
                <button key={kind} type="button" className="asm-add" onClick={() => addPart(kind)}>
                  <span className="asm-add-name">+ {PART_CATALOG[kind]!.name}</span>
                  <span className="asm-add-desc">{PART_CATALOG[kind]!.variants[0]!.desc}</span>
                </button>
              ))}
            </div>
            <p className="asm-label" style={{ marginTop: 10 }}>
              品牌主色
            </p>
            <div className="asm-swatches" role="radiogroup" aria-label="品牌主色">
              {BRAND_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={state.brandColor.toLowerCase() === color.toLowerCase()}
                  className={`asm-swatch${state.brandColor.toLowerCase() === color.toLowerCase() ? ' on' : ''}`}
                  style={{ background: color }}
                  title={color}
                  onClick={() => onChange({ ...state, brandColor: color })}
                />
              ))}
              <label className="asm-color-input">
                自定义
                <input
                  type="color"
                  value={state.brandColor}
                  onChange={(e) => onChange({ ...state, brandColor: e.target.value })}
                  aria-label="自定义品牌主色"
                />
              </label>
            </div>
            <label className="asm-toggle">
              <input
                type="checkbox"
                checked={state.navLinked}
                onChange={(e) => onChange({ ...state, navLinked: e.target.checked })}
              />
              导航连接到手机竖屏
            </label>
          </section>

          <section className="asm-track" aria-label="页面编排轨道">
            <p className="asm-label">编排轨道（拖拽或用按钮调整顺序）</p>
            {state.parts.length === 0 ? (
              <p className="asm-empty">还没有部件。从左边加几个——主视觉和「立即购买」是需求里的硬指标。</p>
            ) : (
              <ol className="asm-list">
                {state.parts.map((part, index) => {
                  const def = PART_CATALOG[part.kind];
                  const open = openPartId === part.id;
                  return (
                    <li
                      key={part.id}
                      className={`asm-item${dragOver === index && dragIndex !== null && dragIndex !== index ? ' drop' : ''}${dragIndex === index ? ' dragging' : ''}`}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(index);
                      }}
                      onDragLeave={() => setDragOver((v) => (v === index ? null : v))}
                      onDrop={(e) => {
                        e.preventDefault();
                        dropOn(index);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDragOver(null);
                      }}
                    >
                      <div className="asm-item-row">
                        <span className="asm-item-order" aria-hidden="true">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          className="asm-item-name"
                          aria-expanded={open}
                          onClick={() => setOpenPartId(open ? null : part.id)}
                        >
                          {def.name}
                          <span className="asm-item-variant">
                            {def.variants.find((v) => v.key === part.variant)?.label ?? part.variant}
                          </span>
                          {part.note ? <span className="asm-item-note-flag">有备注</span> : null}
                        </button>
                        <span className="asm-item-tools">
                          <button type="button" className="asm-tool" aria-label={`上移 ${def.name}`} disabled={index === 0} onClick={() => movePart(index, -1)}>
                            ↑
                          </button>
                          <button
                            type="button"
                            className="asm-tool"
                            aria-label={`下移 ${def.name}`}
                            disabled={index === state.parts.length - 1}
                            onClick={() => movePart(index, 1)}
                          >
                            ↓
                          </button>
                          <button type="button" className="asm-tool danger" aria-label={`移除 ${def.name}`} onClick={() => removePart(part.id)}>
                            ✕
                          </button>
                        </span>
                      </div>
                      {open ? (
                        <div className="asm-item-edit">
                          <div className="asm-variants" role="radiogroup" aria-label={`${def.name}样式`}>
                            {def.variants.map((v) => (
                              <button
                                key={v.key}
                                type="button"
                                role="radio"
                                aria-checked={part.variant === v.key}
                                className={`asm-variant${part.variant === v.key ? ' on' : ''}`}
                                onClick={() => patchPart(part.id, { variant: v.key })}
                              >
                                {v.label}
                                <span className="asm-variant-desc">{v.desc}</span>
                              </button>
                            ))}
                          </div>
                          {part.kind === 'title' || part.kind === 'note' ? (
                            <label className="asm-field">
                              文案
                              <input
                                type="text"
                                value={part.text ?? ''}
                                placeholder={part.kind === 'title' ? '石影 X1，拍下每一次心跳' : '写给开发的说明'}
                                onChange={(e) => patchPart(part.id, { text: e.target.value })}
                              />
                            </label>
                          ) : null}
                          <label className="asm-field">
                            行为备注（开发会看）
                            <input
                              type="text"
                              value={part.note ?? ''}
                              placeholder="这个部件点击后去哪、给谁看"
                              onChange={(e) => patchPart(part.id, { note: e.target.value })}
                            />
                          </label>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="asm-preview" aria-label="实时页面预览">
            <div className="asm-preview-head">
              <p className="asm-label">
                实时预览 · {device === 'desktop' ? '桌面 1280' : '手机 412'}
              </p>
              {deviceSwitch('asm-preview-switch')}
            </div>
            <div className={`asm-page ${device}`}>
              {state.parts.length === 0 ? (
                <p className="asm-page-empty">（空白页）</p>
              ) : (
                state.parts.map((part) => (
                  <PartPreview key={part.id} part={part} state={state} device={device} />
                ))
              )}
            </div>
            <button type="button" className="btn asm-open-canvas" onClick={onOpenCanvas}>
              高级：用 M3E 画布微调
            </button>
          </section>
        </div>
      )}
      {storageWarning ? (
        <div className="notice warn" role="status">
          当前浏览器无法保存草稿，本次编辑只在内存里，刷新会丢。
        </div>
      ) : null}
      <div className="asm-foot">
        <button type="button" className="btn btn-primary asm-save" onClick={onClose}>
          保存并回到办公室
        </button>
      </div>
    </div>
  );
}

/** 单个部件的预览渲染：按 kind + 变体画出接近成品的块面 */
function PartPreview({ part, state, device }: { part: AssemblyPart; state: AssemblyState; device: 'desktop' | 'mobile' }) {
  const brand = state.brandColor;
  const compact = device === 'mobile';
  switch (part.kind) {
    case 'nav':
      if (part.variant === 'none') {
        return <div className="pv pv-nav pv-nav-none">（全屏沉浸 · 无导航）</div>;
      }
      if (part.variant === 'burger') {
        return (
          <div className="pv pv-burger-row">
            <span className="pv-spacer" />
            <span className="pv-burger" style={{ borderColor: brand }}>
              ≡
            </span>
          </div>
        );
      }
      return (
        <div className="pv pv-nav" style={{ background: compact ? '#13141A' : 'rgba(19,20,26,0.88)' }}>
          <span className="pv-nav-logo" style={{ color: brand }}>
            SHIYING 石影
          </span>
          <span className="pv-nav-links">
            X1 新品 <i>参数</i> <i>配件</i>
            {state.navLinked ? <i className="pv-nav-link">手机版 ↗</i> : null}
          </span>
        </div>
      );
    case 'hero':
      return (
        <div className={`pv pv-hero ${part.variant}`}>
          <span className="pv-hero-art" aria-hidden="true">
            {part.variant === 'mud_splash' ? '◤ 泥地飞溅 · 极限特写 ◢' : part.variant === 'studio_side' ? '—— 产品正侧视图 ——' : '[ 贴纸×参数×拼贴 ]'}
          </span>
        </div>
      );
    case 'title': {
      const text = part.text?.trim() || (part.variant === 'pair' ? '石影 X1 · 为极限而生' : '石影 X1，拍下每一次心跳');
      return (
        <div className={`pv pv-title ${part.variant === 'pair' ? 'pair' : ''}`}>
          {text}
          {part.variant === 'pair' ? <span className="pv-title-sub">三防运动相机 · 新品首发</span> : null}
        </div>
      );
    }
    case 'specs':
      if (part.variant === 'slogan') {
        return <div className="pv pv-slogan">「一寸轻，一寸稳，一寸快。」</div>;
      }
      if (part.variant === 'table') {
        return (
          <div className="pv pv-table">
            <div className="pv-table-head" style={{ background: '#13141A' }}>
              跑分与规格
            </div>
            <div className="pv-table-grid">
              {['4K/120fps', '1/1.3″', 'ISO 100-25600', '-10℃ 抗寒', '10m 防水', '19min 快充'].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
        );
      }
      return (
        <div className="pv pv-icons">
          {['防水 10m', '防尘', '防摔 1.2m'].map((s) => (
            <span key={s} className="pv-icon" style={{ borderColor: brand }}>
              {s}
            </span>
          ))}
        </div>
      );
    case 'cta': {
      const label = part.variant === 'flash' ? '限时立减 ¥2999 · 立即购买' : part.variant === 'minimal' ? '立即购买 →' : '立即购买';
      return (
        <div className="pv pv-cta-row">
          <button type="button" className={`pv-cta ${part.variant}`} style={part.variant === 'minimal' ? { color: brand } : { background: brand }}>
            {label}
          </button>
        </div>
      );
    }
    case 'bullets':
      return (
        <div className="pv pv-bullets">
          {part.variant === 'numbers'
            ? ['4K/120fps 帧率', '19 分钟极速满电', '1.2 米五防跌落'].map((s) => <span key={s}>▪ {s}</span>)
            : ['滑雪不冻机', '骑行超级防抖', '潜水 10 米'].map((s) => <span key={s}>▪ {s}</span>)}
        </div>
      );
    case 'footer':
      return <div className="pv pv-footer">石影 SHIYING © 2026 · 官方商城 · 售后政策</div>;
    case 'note':
      return (
        <div className="pv pv-note">
          备注：{part.text?.trim() || (part.variant === 'risk' ? '风险备注：跑分数据待产品确认后再上。' : '需求备注：首屏主视觉与立即购买不可替换。')}
        </div>
      );
  }
}
