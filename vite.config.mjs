import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@credo-ts/didcomm-transport-queue-dynamodb': path.resolve(
        import.meta.dirname,
        './packages/transport-queue-dynamodb/src/index.ts'
      ),
      '@credo-ts/didcomm-transport-queue-postgres': path.resolve(
        import.meta.dirname,
        './packages/transport-queue-postgres/src/index.ts'
      ),
    },
  },
  test: {
    watch: false,
    include: ['**/*.{test,tests}.ts'],
    coverage: {
      include: ['packages/**/src/**.{js,jsx,ts,tsx}', 'apps/**/src/**.{js,jsx,ts,tsx}'],
    },
  },
})
