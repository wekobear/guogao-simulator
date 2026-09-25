/**
 * pnpm validate:content —— 预览阶段的内容校验入口。
 * 校验 src/content/game.v1.json 的结构与引用自洽性（与运行时同一套规则）。
 */
import { gameContentSchema, validateReferences } from '../src/content/schema';
import raw from '../src/content/game.v1.json' with { type: 'json' };

const parsed = gameContentSchema.safeParse(raw);
if (!parsed.success) {
  console.error('内容结构校验失败：');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
const errors = validateReferences(parsed.data);
if (errors.length > 0) {
  console.error('内容引用校验失败：');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`内容校验通过：${parsed.data.contentVersion}`);
