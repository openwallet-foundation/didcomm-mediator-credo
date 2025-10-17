import { CacheModule, InMemoryLruCache } from '@credo-ts/core'
import { RedisCache } from '@credo-ts/redis-cache'

import Redis from 'ioredis'
import { config, logger } from '../config'

export function loadCacheStorage({ redisClient }: { redisClient?: Redis } = {}) {
  const { cache } = config
  if (cache.type === 'redis') {
    logger.info('Using redis cache storage')

    return {
      cache: new CacheModule({
        cache: new RedisCache(redisClient ?? new Redis(cache.redisUrl)),
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
