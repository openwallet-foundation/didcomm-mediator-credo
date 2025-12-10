import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@credo-ts/didcomm-transport-queue-dynamodb': path.resolve(
        import.meta.dirname,
        '../../packages/transport-queue-dynamodb/src/index.ts'
      ),
      '@credo-ts/didcomm-transport-queue-postgres': path.resolve(
        import.meta.dirname,
        '../../packages/transport-queue-postgres/src/index.ts'
      ),
    },
  },
  ssr: {
    noExternal: true,
  },
})
