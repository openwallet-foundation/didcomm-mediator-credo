FROM node:20.11 AS base

RUN apt-get update && \
  apt-get upgrade -y && \ 
  npm install -g corepack@latest && \
  corepack enable && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json /app/package.json
COPY pnpm-lock.yaml /app/pnpm-lock.yaml
COPY pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY apps/mediator/package.json /app/apps/mediator/package.json
COPY packages/message-pickup-dynamodb/package.json /app/packages/message-pickup-dynamodb/package.json
COPY packages/message-pickup-postgres/package.json /app/packages/message-pickup-postgres/package.json

RUN pnpm install --frozen-lockfile

COPY . /app
RUN pnpm build


# Don't run production as root
RUN addgroup --system --gid 1001 agent && \
  adduser --system --uid 1001 agent && \
  mkdir -p /nonexistent && \
  chown agent:agent /nonexistent

USER agent

ENTRYPOINT [ "node", "apps/mediator/build/index.js" ]
