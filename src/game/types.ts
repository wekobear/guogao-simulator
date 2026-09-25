/** 局内阶段 */
export type Phase =
  | 'PREPARE'
  | 'REVIEW'
  | 'RESPOND'
  | 'EVENT'
  | 'BONUS'
  | 'PARTY'
  | 'ENDING';

/** 五项指标 */
export type Stats = {
  quality: number;
  trust: number;
  energy: number;
  evidence: number;
  scopeDebt: number;
};

export type StatKey = keyof Stats;

export type EndingId =
  | 'PASS_PROTECTED'
  | 'PASS_COMPROMISE'
  | 'BURNOUT'
  | 'FIRED'
  | 'LOOP'
  | 'QUIT';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

/** 退回原因 ID，只能取这三个值；通过时为空 */
export type ReasonId = 'score' | 'trust' | 'evidenceOrTrust';

/** 冻结的评审快照；生成后不再随后续选择变化 */
export type Review = {
  round: number;
  score: number;
  grade: Grade;
  passed: boolean;
  reasonIds: ReasonId[];
  statsSnapshot: Stats;
  text: string;
};

export type LogKind = 'preparation' | 'response' | 'event' | 'bonus' | 'party' | 'quit';

export type LogEntry = {
  seq: number;
  kind: LogKind;
  round: number;
  itemId: string;
  optionId?: string;
  before: Stats;
  after: Stats;
  resultText: string;
};

export type Bonus = {
  initialBossShare: number;
  playerShare: number | null;
  redPacket: number;
  cash: number;
};

/** 一局完整状态；可整体序列化进 localStorage */
export type Run = {
  schemaVersion: 1;
  contentVersion: '1.0.0';
  runId: string;
  seed: number;
  rngState: number;
  seq: number;
  phase: Phase;
  templateId: string;
  round: 1 | 2 | 3;
  submittedCount: number;
  stats: Stats;
  seenEventIds: string[];
  pendingEventId: string | null;
  review: Review | null;
  reviews: Review[];
  history: LogEntry[];
  bonus: Bonus | null;
  endingId: EndingId | null;
  hadCustomImage: boolean;
};

export type ActionType =
  | 'SUBMIT_PREP'
  | 'CONFIRM_QUIT'
  | 'CONTINUE_REVIEW'
  | 'CHOOSE_RESPONSE'
  | 'CHOOSE_EVENT_OPTION'
  | 'CHOOSE_BONUS'
  | 'CHOOSE_PARTY';

/** 每个游戏动作附带预期 seq，用于幂等与双击拦截 */
export type ActionEnvelope = {
  runId: string;
  expectedSeq: number;
  type: ActionType;
  id?: string;
};

export type StatsDelta = Partial<Stats>;

export type PreparationItem = {
  id: string;
  name: string;
  description: string;
  deltas: StatsDelta;
  resultText: string;
};

export type ResponseItem = {
  id: string;
  name: string;
  description: string;
  deltas: StatsDelta;
  resultText: string;
};

export type EventOption = {
  id: string;
  name: string;
  description: string;
  deltas: StatsDelta;
  resultText: string;
};

export type EventItem = {
  id: string;
  title: string;
  scene: string;
  weight: number;
  options: EventOption[];
};

export type TemplateItem = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  stats: Stats;
};

export type EndingItem = {
  id: EndingId;
  title: string;
  body: string;
  hint: string;
};

export type GameConfig = {
  company: string;
  boss: { id: string; name: string; avatarChar: string };
  playerAvatarChar: string;
  brief: {
    id: string;
    brand: string;
    title: string;
    requirementLines: string[];
    bossExtra: string;
    deliverableNote: string;
  };
  maxSubmissions: number;
  pass: { minScore: number; minTrust: number; minEvidence: number; altTrust: number };
  scoreWeights: { quality: number; trust: number; evidence: number; scopeDebtPenalty: number };
  gradeBounds: { min: number; grade: Grade }[];
  statsMeta: Record<
    StatKey,
    { label: string; max: number; scoreCost?: string }
  >;
  bonusPool: number;
  bossShares: number[];
  negotiate: { requires: { evidence: number; trust: number }; playerShare: number };
  redPacket: { self: number; boss: number };
  currency: string;
};

export type GameContent = {
  contentVersion: string;
  config: GameConfig;
  templates: TemplateItem[];
  preparations: PreparationItem[];
  responses: ResponseItem[];
  events: EventItem[];
  reviews: {
    prefix: string;
    sGradeLine: string;
    lines: Record<Grade, { passed: string; fail: string }>;
  };
  endings: EndingItem[];
};
