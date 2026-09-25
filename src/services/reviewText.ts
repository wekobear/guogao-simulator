import type { Review } from '../game/types';

/**
 * 评语适配层：首版只有脚本实现，永不请求网络。
 * 二期可在此接口下接入外部模型（见 docs/05-ai-extension 预案），评分仍同步确定。
 */
export interface ReviewTextProvider {
  generate(input: { reviewId: string; review: Review; bossId: string }): Promise<{
    source: 'script' | 'ai';
    text: string;
  }>;
}

export class ScriptReviewTextProvider implements ReviewTextProvider {
  async generate(input: { reviewId: string; review: Review; bossId: string }): Promise<{
    source: 'script' | 'ai';
    text: string;
  }> {
    void input.reviewId;
    void input.bossId;
    return { source: 'script', text: input.review.text };
  }
}
