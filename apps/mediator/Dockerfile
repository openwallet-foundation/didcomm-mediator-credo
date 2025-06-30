FROM node:20.11 AS base

RUN apt-get update && \
  apt-get upgrade -y && \ 
  npm install -g corepack@latest && \
  corepack enable && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app


COPY . /app

RUN pnpm install --frozen-lockfile
RUN pnpm --filter didcomm-mediator-service... build

# Don't run production as root
RUN addgroup --system --gid 1001 agent && \
  adduser --system --uid 1001 agent && \
  mkdir -p /nonexistent && \
  chown agent:agent /nonexistent

USER agent

ENTRYPOINT [ "node", "apps/mediator/build/index.js" ]
