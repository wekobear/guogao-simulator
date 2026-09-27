import { defineConfig } from '@playwright/test';

// 独立移动端配置：不带 webServer（主配置的 webServer 清理曾挂起），
// 直连已运行的 preview 服务。用法：
//   pnpm build && pnpm preview --port 5188   # 或复用既有服务
//   pnpm exec playwright test -c playwright.mobile.config.ts mobile.spec.ts
// 可用 E2E_BASE_URL 覆盖目标服务，EVIDENCE_DIR 指定截图输出目录。
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5188';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 40_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results/mobile',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    viewport: { width: 393, height: 852 },
  },
});
