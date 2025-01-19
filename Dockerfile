FROM node:20 AS base

WORKDIR /app

RUN apt-get update && \
  apt-get upgrade -y && \ 
  corepack enable

FROM base AS setup

# Copy root package files
COPY package.json /app/package.json
COPY pnpm-lock.yaml /app/pnpm-lock.yaml
COPY patches /app/patches

# Run yarn install
RUN pnpm install

COPY . /app

RUN pnpm build

FROM base AS final

WORKDIR /app

# Copy build
COPY --from=setup /app/build /app/build

COPY package.json /app/package.json
COPY pnpm-lock.yaml /app/pnpm-lock.yaml
COPY patches /app/patches

# Package yarn install and prune to
# reduce image size
RUN pnpm install --production && \
  pnpm store prune

# Don't run production as root
RUN addgroup --system --gid 1001 agent && \
  adduser --system --uid 1001 agent

USER agent

ENTRYPOINT [ "node", "build/index.js" ]
