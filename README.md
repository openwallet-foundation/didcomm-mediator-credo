<p align="center">
  <br />
  <img
    alt="Credo Logo"
    src="https://raw.githubusercontent.com/openwallet-foundation/credo-ts/c7886cb8377ceb8ee4efe8d264211e561a75072d/images/credo-logo.png"
    height="250px"
  />
</p>
<h1 align="center"><b>DIDComm Mediator Credo</b></h1>
<p align="center">
  <a
    href="https://raw.githubusercontent.com/openwallet-foundation/credo-ts/main/LICENSE"
    ><img
      alt="License"
      src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"
  /></a>
  <a href="https://www.typescriptlang.org/"
    ><img
      alt="typescript"
      src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg"
  /></a>
  <a href="https://github.com/openwallet-foundation/didcomm-mediator-credo/pkgs/container/didcomm-mediator-credo">
    <img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/openwallet-foundation/didcomm-mediator-credo?display_name=tag&label=docker%20tag">
  </a>
</p>
<br />

<p align="center">
  <a href="#getting-started">Getting started</a> 
  &nbsp;|&nbsp;
  <a href="#environment-variables">Environment Variables</a> 
  &nbsp;|&nbsp;
  <a href="#postgres-database">Postgres Database</a> 
  &nbsp;|&nbsp;
  <a href="#using-docker">Using Docker</a> 
  &nbsp;|&nbsp;
  <a href="#roadmap">Roadmap</a> 
  &nbsp;|&nbsp;
  <a href="#how-to-contribute">How To Contribute</a> 
  &nbsp;|&nbsp;
  <a href="#license">License</a> 
</p>

---

This repo contains a [Mediator](https://github.com/hyperledger/aries-rfcs/blob/main/concepts/0046-mediators-and-relays/README.md) Agent for usage with [Hyperledger Aries and DIDComm v1 agents](https://github.com/hyperledger/aries-rfcs/tree/main/concepts/0004-agents). It is built using [Credo](https://github.com/openwallet-foundation/credo-ts).

Why should you use this mediator?

- Automatically set up mediation with the mediator using the [Mediator Coordination Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0211-route-coordination).
- Pick up messages implicitly using WebSockets, using the [Pickup V1 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0212-pickup), and the [Pickup V2 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0685-pickup-v2).
- Configured to persist queued messages for recipient in a postgres.
- Use the pre-built docker image for easy deployment of your mediator.

## Connecting to the Mediator

When you've correctly started the mediator agent, and have extracted the invitation from the console, you can use the invitation to connect to the mediator agent. To connect to the mediator and start receiving messages, there's a few steps that need to be taken:

1. Connect to the mediator from another agent using the created [Out Of Band Invitation](https://github.com/hyperledger/aries-rfcs/blob/main/features/0434-outofband/README.md)
2. Request mediation from the mediator using the [Mediator Coordination Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0211-route-coordination).
3. Start picking up messages implicitly by connecting using a WebSocket and sending any DIDComm message to authenticate, the [Pickup V1 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0212-pickup), or the [Pickup V2 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0685-pickup-v2). We recommend using the Pickup V2 Protocol.

If you're using an Credo agent as the client, you can follow the [Mediation Tutorial](https://credo.js.org/guides/tutorials/mediation) from the Credo docs.

## Development

The mediator can be configured to use different storage backends for various components. During development, you can easily switch between these options by modifying your environment configuration.

### Setting Up Your Development Environment

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Modify the existing `.env.development` file to configure your preferred storage options:

   - Database storage (SQLite or Postgres)
   - Message pickup storage (Credo or DynamoDB)
   - Cache storage (In-memory or Redis)

3. Start the development server:
   ```bash
   pnpm dev
   ```

### Using Docker for External Dependencies

The project includes a Docker Compose file with services for external dependencies. You can selectively start only the services you need based on your configuration:

```bash
# Start all services
docker-compose up

# Or start individual services as needed
docker-compose up postgres
docker-compose up redis
docker-compose up dynamodb
```

For example:

- If using Postgres for database storage, start the Postgres service
- If using Redis for caching, start the Redis service
- If using DynamoDB for message pickup, start the DynamoDB service

### External Access

To reach the mediator from external devices or for testing with mobile apps, set up an ngrok tunnel. Since the `.env.local` file isn't loaded, you'll need to provide the auth token directly with the command:

```bash
NGROK_AUTH_TOKEN=your_token_here pnpm dev
```

You can obtain an auth token from: https://dashboard.ngrok.com/get-started/your-authtoken

## Configuration

The mediator can be configured using **environment variables** or a **JSON configuration file**. All configuration options are available via both methods, and you can use the provided sample files for quick setup.

## Configuration Methods

### 1. Environment Variables

- All configuration options can be set via environment variables.
- Nested config options use double underscores (`__`) for nesting. For example:
  - `ASKAR__STORE_ID=test`
  - `MESSAGE_PICKUP__STORAGE__TYPE=postgres`
  - `CACHE__TYPE=redis`
  - `CACHE__REDIS_URL=redis://127.0.0.1:6379`
- See the [Configuration Reference](#configuration-reference) below for all available options and their ENV names.

### 2. JSON Configuration File

- You can provide a JSON config file and point to it with the `CONFIG` environment variable:
  ```sh
  CONFIG=apps/mediator/samples/full.json pnpm dev
  ```
- See the [`apps/mediator/samples/`](apps/mediator/samples/) directory for example config files:
  - `simple.json`: Minimal config (just Askar storeId/storeKey)
  - `simple-defaults.json`: Minimal config with all defaults
  - `full.json`: All options enabled (Postgres, Redis, DynamoDB, etc.)
  - `cache-in-memory.json`, `cache-redis.json`: Cache backend examples
  - `message-pickup-credo.json`, `message-pickup-dynamodb.json`, `message-pickup-postgres.json`: Message pickup storage examples
  - `storage-askar-sqlite.json`, `storage-askar-postgres.json`, `storage-drizzle-sqlite.json`, `storage-drizzle-postgres.json`: Storage backend examples

## Configuration Reference

Below are the top-level configuration options. All can be set via ENV (with double underscores for nesting) or in a JSON config file.

| Option              | Type/Values                                                        | Default                         | Description              |
| ------------------- | ------------------------------------------------------------------ | ------------------------------- | ------------------------ |
| `logLevel`          | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `off`          | `info`                          | Log verbosity            |
| `storage`           | `{ type: 'askar' }` or `{ type: 'drizzle', dialect, databaseUrl }` | `{ type: 'askar' }`             | Main storage backend     |
| `kms`               | `{ type: 'askar' }`                                                | `{ type: 'askar' }`             | KMS backend              |
| `askar`             | `{ storeId, storeKey, keyDerivationMethod, database }`             |                                 | Askar config (see below) |
| `cache`             | `{ type: 'in-memory' }` or `{ type: 'redis', redisUrl }`           | `{ type: 'in-memory'}`          | Cache backend            |
| `messagePickup`     | `{ forwardingStrategy, storage }`                                  | See below                       | Message pickup config    |
| `pushNotifications` | `{ webhookUrl, firebase }`                                         | `{}`                            | Push notification config |
| `agentPort`         | Number                                                             | `3110`                          | Port for HTTP/WS         |
| `agentEndpoints`    | Array of URLs                                                      | See below                       | Agent endpoints          |
| `agentName`         | String                                                             | `Credo DIDComm Mediator`        | Agent name               |
| `invitationUrl`     | URL                                                                | `/invitation` on first endpoint | Invitation URL           |

### Askar Database

- `database.type`: `sqlite` or `postgres`
- For `postgres`, also set: `host`, `user`, `password`, `adminUser`, `adminPassword`

### Drizzle Storage

- `dialect`: `sqlite` or `postgres`
- `databaseUrl`: Connection string

### Cache

- `type`: `in-memory` or `redis`
- For `redis`, set `redisUrl`

### Message Pickup

- `forwardingStrategy`: `DirectDelivery`, `QueueOnly`, `QueueAndLiveModeDelivery`
- `storage.type`: `credo`, `postgres`, or `dynamodb`
  - For `postgres`: `host`, `user`, `password`, `database`
  - For `dynamodb`: `region`, `accessKeyId`, `secretAccessKey`, `tableName`

### Push Notifications

- `webhookUrl`: URL for webhook notifications
- `firebase`: `{ projectId, clientEmail, privateKey, notificationTitle, notificationBody }`

### Example: ENV vs JSON

**ENV:**

```sh
ASKAR__STORE_ID=test \
ASKAR__STORE_KEY=test \
CACHE__TYPE=redis \
CACHE__REDIS_URL=redis://127.0.0.1:6379 \
MESSAGE_PICKUP__STORAGE__TYPE=dynamodb \
MESSAGE_PICKUP__STORAGE__REGION=local \
MESSAGE_PICKUP__STORAGE__ACCESS_KEY_ID=local \
MESSAGE_PICKUP__STORAGE__TABLE_NAME=queued_messages \
MESSAGE_PICKUP__STORAGE__SECRET_ACCESS_KEY=local \
pnpm dev
```

**JSON:**

```json
{
  "askar": {
    "storeId": "test",
    "storeKey": "test"
  },
  "cache": {
    "type": "redis",
    "redisUrl": "redis://127.0.0.1:6379"
  },
  "messagePickup": {
    "storage": {
      "type": "dynamodb",
      "region": "local",
      "accessKeyId": "local",
      "secretAccessKey": "local"
    }
  }
}
```

For more examples, see the [`apps/mediator/samples/`](apps/mediator/samples/) directory.

## Using Docker

You can run the mediator using Docker with either environment variables or a JSON config file. For example:

**Using ENV:**

```sh
docker run \
  -e "ASKAR__STORE_ID=test" \
  -e "ASKAR__STORE_KEY=test" \
  -e "CACHE__TYPE=redis" \
  -e "CACHE__REDIS_URL=redis://127.0.0.1:6379" \
  -e "MESSAGE_PICKUP__STORAGE__TYPE=dynamodb" \
  -e "MESSAGE_PICKUP__STORAGE__REGION=local" \
  -e "MESSAGE_PICKUP__STORAGE__ACCESS_KEY_ID=local" \
  -e "MESSAGE_PICKUP__STORAGE__SECRET_ACCESS_KEY=local" \
  -p 3000:3000 \
  ghcr.io/openwallet-foundation/didcomm-mediator-credo:latest
```

**Using a JSON config file:**

```sh
docker run \
  -e "CONFIG=/config/full.json" \
  -v $(pwd)/apps/mediator/samples/full.json:/config/full.json \
  -p 3000:3000 \
  ghcr.io/openwallet-foundation/didcomm-mediator-credo:latest
```

You can also adapt the `apps/mediator/docker-compose.yml` file to your needs.

## Using Docker Compose for External Dependencies

The project includes a Docker Compose file with services for external dependencies. You can selectively start only the services you need based on your configuration:

```bash
docker-compose up # Start all services
docker-compose up postgres # Start only Postgres
docker-compose up redis    # Start only Redis
docker-compose up dynamodb # Start only DynamoDB
```

## External Access

To reach the mediator from external devices or for testing with mobile apps, set up an ngrok tunnel. Since the `.env.local` file isn't loaded, you'll need to provide the auth token directly with the command:

```bash
NGROK_AUTH_TOKEN=your_token_here pnpm dev
```

You can obtain an auth token from: https://dashboard.ngrok.com/get-started/your-authtoken

## Roadmap

The contents in this repository started out as a simple mediator built using Credo that can be used for development. Over time we've added some features, but there's still a lot we want to add to this repository over time. Some things on the roadmap:

- Expose a `did:web` did, so you can directly connect to the mediator using only a did
- DIDComm v2 support
- Allow to control acceptance of mediation requests

## 🖇️ How To Contribute

You're welcome to contribute to this repository. Please make sure to open an issue first for bigger changes!

This mediator is open source and you're more than welcome to customize and use it to create your own mediator.

## License

The DIDComm Mediator Credo is licensed under the Apache License Version 2.0 (Apache-2.0).
