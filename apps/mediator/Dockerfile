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

RUN pnpm install --frozen-lockfile && \
  pnpm --filter didcomm-mediator-service... build && \
  pnpm prune --prod

FROM base AS final

WORKDIR /app

# Copy build
COPY --from=build /build /app

# Don't run production as root
RUN addgroup --system --gid 1001 agent && \
  adduser --system --uid 1001 agent && \
  mkdir -p /nonexistent && \
  chown agent:agent /nonexistent

USER agent

ENTRYPOINT [ "node", "apps/mediator/build/index.js" ]
