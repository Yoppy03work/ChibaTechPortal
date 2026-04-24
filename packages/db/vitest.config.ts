import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // WHY: Prisma 接続の初期化・破棄を serial に行うため workers=1 相当の設定。
    // 並列 markUsedAtomically のテスト自体は Promise.all で同一プロセス内で行う。
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30000,
  },
});
