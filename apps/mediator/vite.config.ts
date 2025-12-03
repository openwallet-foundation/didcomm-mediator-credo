import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@credo-ts/didcomm-message-pickup-dynamodb': path.resolve(
        import.meta.dirname,
        '../../packages/message-pickup-dynamodb/src/index.ts'
      ),
      '@credo-ts/didcomm-message-pickup-postgres': path.resolve(
        import.meta.dirname,
        '../../packages/message-pickup-postgres/src/index.ts'
      ),
    },
  },
  ssr: {
    noExternal: true,
  },
})
