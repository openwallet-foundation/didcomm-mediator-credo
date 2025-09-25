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

FROM base AS final

WORKDIR /app

# Install jemalloc, allows loading a different memory allocator
# to help with memory fragmentation issues in long running node processes
# See https://jemalloc.net/
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjemalloc2 \
 && rm -rf /var/lib/apt/lists/*

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

ENTRYPOINT [ "node", "./build/apps/mediator/src/index.js" ]
