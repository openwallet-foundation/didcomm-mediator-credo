import { CacheModule, InMemoryLruCache } from '@credo-ts/core'
import { RedisCache } from '@credo-ts/redis-cache'

import { config, logger } from '../config'

export function loadCacheStorage() {
  const { cache } = config
  if (cache.type === 'redis') {
    logger.info('Using redis cache storage')
    return {
      cache: new CacheModule({
        // FIXME: should allow string as type
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        cache: new RedisCache(cache.redisUrl as any),
        useCachedStorageService: true,
      }),
    }
  }

  logger.info('Using in-memory cache storage')
  return {
    cache: new CacheModule({
      cache: new InMemoryLruCache({
        // TODO: add env variable to configure this
        limit: 500,
      }),
    }),
  }
}
