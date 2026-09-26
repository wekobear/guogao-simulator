/** 构建 vendor/m3e-canvas 并拷贝到 public/canvas/（同源 iframe 加载目标） */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'vendor', 'm3e-canvas');
const dest = join(root, 'public', 'canvas');

// 已有产物且未强制刷新时跳过（本地反复 build/e2e 不必重装依赖；CI 全新环境会正常构建）
if (existsSync(join(dest, 'index.html')) && !process.argv.includes('--force')) {
  console.log('[build-canvas] public/canvas 已存在，跳过（--force 重建）');
  process.exit(0);
}

execSync('npm ci --no-audit --no-fund', { cwd: app, stdio: 'inherit' });
execSync('npm run build', {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_BASE_PATH: '/canvas' },
});
rmSync(dest, { recursive: true, force: true });
mkdirSync(join(root, 'public'), { recursive: true });
cpSync(join(app, 'out'), dest, { recursive: true });
console.log('[build-canvas] public/canvas 已更新');
