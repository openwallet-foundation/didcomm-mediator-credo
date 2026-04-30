import { describe, expect, test } from 'vitest'
import { createSafeJsonReplacer } from './replaceError.js'

describe('createSafeJsonReplacer', () => {
  test('serializes errors with circular response data', () => {
    const error = new Error('Provisioned throughput exceeded')
    error.name = 'ProvisionedThroughputExceededException'

    const response: Record<string, unknown> = {}
    const request = { res: response }
    response.req = request
    Object.assign(error, { response })

    const serialized = JSON.parse(JSON.stringify({ error }, createSafeJsonReplacer(), 2))

    expect(serialized.error).toEqual({
      name: 'ProvisionedThroughputExceededException',
      message: 'Provisioned throughput exceeded',
      stack: expect.any(String),
      response: {
        req: {
          res: '[Circular]',
        },
      },
    })
  })
})
