import type { SketchFindingId } from '../game/prototype';

/**
 * 「认真模式」原型检查的文案层。
 * bossLines / praise / docCard 由 Antigravity（agy）按 docs/m3e-canvas-plan.md §2.3 生成，
 * 人工审校后定稿；findingText 为引擎 finding 的中性描述。
 */

export const SKETCH_FINDING_TEXT: Record<SketchFindingId, string> = {
  'sketch:unreadable': '原型数据无法读取',
  'sketch:empty': '画布是空的',
  'sketch:no-cta': '首屏没有「立即购买」按钮',
  'sketch:no-hero': '首屏缺少主视觉产品图',
  'sketch:no-phone': '没有手机竖屏版',
  'sketch:no-nav': '页面之间没有可点的导航',
  'sketch:off-brand': '配色偏离石影品牌橙',
  'sketch:overbuilt': '部件堆得太多，范围膨胀',
  'sketch:no-notes': '部件没有行为备注',
};

export type SketchLines = {
  findingText: Record<SketchFindingId, string>;
  bossLines: Record<SketchFindingId, string[]>;
  praise: string[];
  docCard: { title: string; subtitle: string; footer: string };
};

export const sketchLines: SketchLines = {
  findingText: SKETCH_FINDING_TEXT,
  bossLines: {
    'sketch:unreadable': [
      '原型文件打不开，是你交了个寂寞，还是想考验我的想象力？',
      '数据都读不出来，难怪感觉很奇怪——这单的颗粒度约等于没有。',
      '连稿子都是坏的，建议先和研发对齐一下什么叫可交付。',
    ],
    'sketch:empty': [
      '交白卷就是你理解的高级感？虽然我还没想好，但你也不能直接交个空气让我赋能吧。',
      '感觉很奇怪，画布比我的思路还干净，你这是打算用心灵感应向用户传达石影X1吗？',
      '工作量饱和度一眼望穿，你这原型连热闹的边都没沾上，下班前把闭环给我画出来。',
    ],
    'sketch:no-cta': [
      '做DTC不是做慈善！连「立即购买」都没有，你让进店的客户把钱包投进功德箱吗？',
      '需求白纸黑字写着购买路径不超过两步，你倒好，直接把临门一脚的抓手给拔了？',
      '感觉很奇怪，首屏热闹全看完了，转化按钮却在玩捉迷藏，怎么促成首发权益变现？',
    ],
    'sketch:no-hero': [
      '石影X1才是主角！首屏主视觉直接被你吃了，用户点进来以为我们在卖网站背景板？',
      '核心参数与产品图不可替换，你连机子都不放，哪来的底气跟我谈高级和科技感？',
      '感觉很奇怪，首屏没有大拿产品图撑场面，我怎么在集团汇报时吹这个上新标杆？',
    ],
    'sketch:no-phone': [
      '都说了移动端竖屏优先，现在谁拿台式机买运动相机？你的设计思维还活在PC时代？',
      '手机竖屏首屏要能看清产品名与首发权益，你连手机框都没拉，怎么验证首屏穿透力？',
      '感觉很奇怪，我上厕所怎么用手机验收你的方案？连竖屏都没适配，格局完全没打开。',
    ],
    'sketch:no-nav': [
      '页面连个可点导航都没有，你这是给用户建了座迷宫，打算把潜客全困在首屏吗？',
      '购买路径不超过两步的前提是路要通！没有跳转锚点，你让用户顺着网线爬去支付？',
      '感觉很奇怪，独立站不是单机展示PPT，组件间没串联成闭环，体验极其割裂。',
    ],
    'sketch:off-brand': [
      '石影品牌橙是我们的心智资产！你整这一出大红大紫，是想给竞品办喜事吗？',
      '我要的是有质感的热闹，不是让你把品牌橙换成这种廉价色调，高级感全崩塌了。',
      '感觉很奇怪，这配色偏离主视觉太远了，连石影X1的科技调性都被你洗脱色了。',
    ],
    'sketch:overbuilt': [
      '需求要热闹不是让你开大集！什么破烂都往上堆，石影X1核心参数全被淹死了。',
      '加这么多轮播和弹窗，两步购买路径被你扩写成西天取经，用户早被劝退了！',
      '感觉很奇怪，首屏元素多到像信息垃圾场，你懂不懂什么叫高级感的留白克制？',
    ],
    'sketch:no-notes': [
      '部件连个交互备注都不写，研发拿到问怎么交互，是让我当你的贴身人肉说明书吗？',
      '首发权益怎么领？弹窗逻辑是什么？颗粒度这么粗，全靠开发在暗中脑补业务？',
      '感觉很奇怪，只有静态皮囊没有行为定义，你画的「立即购买」真能打通支付流吗？',
    ],
  },
  praise: [
    '这版总算勉强能看了，主要还是我当初「要高级也要热闹」的战略定调给得精准。',
    '行吧，石影X1的主视觉立住了；要不是我替你把关两步转化，你早做出自嗨产品了。',
    '有点那味了，多亏我之前多次说「感觉很奇怪」启发你，汇报时我会提一嘴你的执行。',
  ],
  docCard: {
    title: '石影X1原型规范',
    subtitle: '差不多创意部导出的落地页原型说明',
    footer: '写得不错，但我感觉很奇怪，明天推倒重做。',
  },
};
