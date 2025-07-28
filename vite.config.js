const path = require('node:path')

export default {
  resolve: {
    alias: {
      '@credo-ts/didcomm-message-pickup-dynamodb': path.resolve(
        __dirname,
        './packages/message-pickup-dynamodb/src/index.ts'
      ),
      '@credo-ts/didcomm-message-pickup-postgres': path.resolve(
        __dirname,
        './packages/message-pickup-postgres/src/index.ts'
      ),
    },
  },
  test: {
    watch: false,
    include: ['**/*.{test,tests}.ts'],
  },
}
