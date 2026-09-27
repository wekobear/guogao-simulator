/**
 * 2.5D 像素办公室 · 现代办公调色板
 * 依据高层开放办公参考图：冷灰室内（白顶/灰毯/白桌）× 桃金夕阳窗外景，
 * 全部原创程序像素绘制。
 */

export const PAL = {
  /** 窗外：浅蓝天空、桃金晚霞与阶梯像素落日 */
  skyHigh: '#9cb7d2',
  skyMid: '#b4c8da',
  skyWarm: '#e6b084',
  sunsetGold: '#e8a86e',
  sunsetPeach: '#f5cb98',
  sunCore: '#f9d3a2',
  sunCoreLit: '#fdeac0',
  cityFar: '#7e8fa4',
  cityNear: '#5f6f85',
  waterline: '#93a7ba',
  cityLit: '#f4d9a8',
  /** 白色裸顶与结构 */
  ceilWhite: '#c9cdd5',
  beamLight: '#d6dae1',
  beamGrey: '#b3b8c2',
  beamShade: '#9aa0ab',
  /** 剖面基座（混凝土） */
  cutSolid: '#22252c',
  cutDeep: '#181a20',
  cutLine: '#343945',
  /** 白柱 / 白家具三阶 */
  colWhite: '#eef0f3',
  colShade: '#c6cbd4',
  colDark: '#a8aeb9',
  /** 黑灰细窗框与卷帘 */
  frameDark: '#2e3238',
  frameMid: '#3c414a',
  blindGrey: '#9aa0ab',
  blindEdge: '#7c8290',
  /** 灰色地毯砖（远亮近暗） */
  carpetFar: '#8f95a1',
  carpetMid: '#848a97',
  carpetNear: '#797f8d',
  /** 人体工学椅（黑框灰网） */
  chairFrame: '#2c3038',
  chairMesh: '#6f7683',
  chairMeshLit: '#8b93a2',
  /** 浅木开放格 */
  woodMild: '#c9a878',
  woodMildDark: '#a8875c',
  /** 绿植与白色花槽 */
  plantLeaf: '#3e6953',
  leafLight: '#a3c9a8',
  leafDeep: '#2e5140',
  troughWhite: '#e4e7ec',
  /** 纸面与道具 */
  paperWhite: '#EDE6D6',
  warnRed: '#D9383A',
  gold: '#F7B733',
  blindLight: '#DCE5F2',
  screenGlow: '#6ec8ff',
  /** UI 与交互提示 */
  uiInk: '#13141A',
  smoke: '#838C9E',
} as const;

export type PalColor = keyof typeof PAL;
