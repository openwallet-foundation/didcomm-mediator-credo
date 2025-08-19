FROM node:22 AS base

RUN apt-get update && \
  apt-get upgrade -y && \ 
  npm install -g corepack@latest && \
  corepack enable && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

FROM base AS build

WORKDIR /build

COPY . /build

RUN pnpm install --node-linker=hoisted --frozen-lockfile && \
  pnpm --filter didcomm-mediator-service build && \
  pnpm prune --prod

# Install jemalloc
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjemalloc2 \
 && rm -rf /var/lib/apt/lists/*

# Preload jemalloc instead of glibc malloc
# jemalloc is more predictable with RSS and crypto-heavy loads
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Optional: tune jemalloc behavior (releases dirty pages back to OS more aggressively)
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:500,muzzy_decay_ms:500"

FROM base AS final

WORKDIR /app

# Copy build artifacts
COPY --from=build /build/node_modules /app/node_modules
COPY --from=build /build/apps/mediator/build /app/build
COPY --from=build /build/apps/mediator/package.json /app

# Don't run production as root
RUN addgroup --system --gid 1001 agent && \
  adduser --system --uid 1001 agent && \
  mkdir -p /nonexistent && \
  chown agent:agent /nonexistent

USER agent

ENV MALLOC_TRIM_THRESHOLD_=262144
ENV NODE_ENV=production

ENTRYPOINT [ "node", "--max-old-space-size=240", "--optimize-for-size", "--gc-interval=100", "./build/apps/mediator/src/index.js" ]