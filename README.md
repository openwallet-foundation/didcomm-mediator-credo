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

## Environment Variables

You can provide a number of environment variables to run the agent. The following table lists the environment variables that can be used.

| Variable                                            | Description                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENT_ENDPOINTS`                                   | Comma separated list of endpoints, in order of preference. In most cases you want to provide two endpoints, where the first one is an HTTP url, and the second one is an WebSocket url                                                                                            |
| `AGENT_NAME`                                        | The name of the agent. This will be used in invitations and will be publicly advertised.                                                                                                                                                                                          |
| `AGENT_PORT`                                        | The port that is exposed for incoming traffic. Both the HTTP and WS inbound transport handlers are exposes on this port, and HTTP traffic will be upgraded to the WebSocket server when applicable.                                                                               |
| `WALLET_NAME`                                       | The name of the wallet to use.                                                                                                                                                                                                                                                    |
| `WALLET_KEY`                                        | The key to unlock the wallet.                                                                                                                                                                                                                                                     |
| `INVITATION_URL`                                    | Optional URL that can be used as the base for the invitation url. This would allow you to render a certain web page that can extract the invitation form the `oob` parameter, and show the QR code, or show useful information to the end-user. Less applicable to mediator URLs. |
| `POSTGRES_HOST`                                     | Host of the database to use. Should include both host and port.                                                                                                                                                                                                                   |
| `POSTGRES_USER`                                     | The postgres user.                                                                                                                                                                                                                                                                |
| `POSTGRES_PASSWORD`                                 | The postgres password.                                                                                                                                                                                                                                                            |
| `POSTGRES_ADMIN_USER`                               | The postgres admin user.                                                                                                                                                                                                                                                          |
| `POSTGRES_ADMIN_PASSWORD`                           | The postgres admin password.                                                                                                                                                                                                                                                      |
| `USE_PUSH_NOTIFICATIONS`                            | A boolean flag that informs the system it should send push notifications.                                                                                                                                                                                                         |
| `FIREBASE_PROJECT_ID`                               | (OPTIONAL) The firebase project ID generated when setting up a Firebase Cloud Messaging project, required if sending push notifications via Firebase Cloud Messaging.                                                                                                             |
| `FIREBASE_CLIENT_EMAIL`                             | (OPTIONAL) Firebase client email generated when setting up Firebase Cloud Messaging project, required if sending push notifications via Firebase Cloud Messaging.                                                                                                                 |
| `FIREBASE_PRIVATE_KEY`                              | (OPTIONAL) Private key generated when setting up Firebase Cloud Messaging project, required if sending push notifications via Firebase Cloud Messaging.                                                                                                                           |
| `NOTIFICATION_WEBHOOK_URL`                          | (OPTIONAL) A url used for sending notifications to                                                                                                                                                                                                                                |
| `MESSAGE_PICKUP_STORAGE`                            | Defines the storage type for message pickup. Default is `credo`. Alternative option is `dynamodb`.                                                                                                                                                                                |
| `MESSAGE_PICKUP_STORAGE_DYNAMODB_REGION`            | (OPTIONAL) The AWS region where the DynamoDB is hosted. Required if using DynamoDB for message pickup.                                                                                                                                                                            |
| `MESSAGE_PICKUP_STORAGE_DYNAMODB_ACCESS_KEY_ID`     | (OPTIONAL) Access key ID for AWS DynamoDB access. Required if using DynamoDB for message pickup.                                                                                                                                                                                  |
| `MESSAGE_PICKUP_STORAGE_DYNAMODB_SECRET_ACCESS_KEY` | (OPTIONAL) Secret access key for AWS DynamoDB access. Required if using DynamoDB for message pickup.                                                                                                                                                                              |
| `CACHE_STORAGE`                                     | Defines the storage type for caching. Default is `in-memory`. Alternative option is `redis`.                                                                                                                                                                                      |
| `CACHE_STORAGE_REDIS_URL`                           | (OPTIONAL) Connection URL for Redis cache. Required if using Redis for caching.                                                                                                                                                                                                   |

## Database Storage

The mediator uses Askar for database storage with two supported backends:

### SQLite (Default)

By default, the mediator uses SQLite for data storage:

1. No additional configuration is needed.
2. Data will be stored in a local SQLite file.
3. This option is ideal for development and testing environments.

### Postgres

For production environments or when scaling:

1. Create a Postgres database and ensure it is accessible from your deployment.
2. Set the following environment variables:
   - `POSTGRES_HOST` - The host and port of your Postgres server
   - `POSTGRES_USER` - Regular database user
   - `POSTGRES_PASSWORD` - Password for the regular user
   - `POSTGRES_ADMIN_USER` - Admin database user
   - `POSTGRES_ADMIN_PASSWORD` - Password for the admin user
3. For simplicity, you can use the same username and password for both regular and admin users, though creating separate users is recommended for better security.
4. Make sure the database is properly secured, especially if it's publicly exposed.

## Message Pickup Storage

The mediator supports two options for message pickup storage:

### Credo (Default)

By default, message pickup storage uses Credo's internal storage mechanism:

1. No additional configuration is needed.
2. Simply leave `MESSAGE_PICKUP_STORAGE` unset or explicitly set it to `credo`.

### DynamoDB

For production environments or when scaling, you can use AWS DynamoDB for message pickup:

1. Create a DynamoDB table in your AWS account or set up a local DynamoDB instance for development.
2. Set the following environment variables:
   - `MESSAGE_PICKUP_STORAGE=dynamodb`
   - `MESSAGE_PICKUP_STORAGE_DYNAMODB_REGION` - AWS region where your table is located
   - `MESSAGE_PICKUP_STORAGE_DYNAMODB_ACCESS_KEY_ID` - Your AWS access key ID
   - `MESSAGE_PICKUP_STORAGE_DYNAMODB_SECRET_ACCESS_KEY` - Your AWS secret access key
3. For local development, you can use local DynamoDB with values like:
   - `MESSAGE_PICKUP_STORAGE_DYNAMODB_REGION=local`
   - `MESSAGE_PICKUP_STORAGE_DYNAMODB_ACCESS_KEY_ID=local`
   - `MESSAGE_PICKUP_STORAGE_DYNAMODB_SECRET_ACCESS_KEY=local`

## Cache Storage

The mediator supports two caching mechanisms:

### In-Memory (Default)

By default, caching uses an in-memory storage system:

1. No additional configuration is needed.
2. Simply leave `CACHE_STORAGE` unset or explicitly set it to `in-memory`.
3. Note that in-memory cache will be cleared when the mediator restarts.

### Redis

For production environments or when scaling to multiple instances:

1. Set up a Redis server or use a managed Redis service.
2. Configure the mediator with:
   - `CACHE_STORAGE=redis`
   - `CACHE_STORAGE_REDIS_URL` - The connection URL for your Redis instance (e.g., `redis://127.0.0.1:6379`)
3. Redis provides persistent caching that survives mediator restarts and can be shared across multiple mediator instances.

## Using Docker

### Using the pre-built Docker Image

1. Make sure you're [authenticated to the Github Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry)
2. Run the docker image using the following command:

```sh
docker run \
  -e "AGENT_ENDPOINTS=http://localhost:3000,ws://localhost:3000" \
  -e "WALLET_KEY=<your-wallet-key>" \
  -e "WALLET_NAME=mediator" \
  -e "AGENT_NAME=Mediator" \
  -e "AGENT_PORT=3000" \
  -e "POSTGRES_HOST=mediator-database-xxxx.ondigitalocean.com:25060" \
  -e "POSTGRES_USER=postgres" \
  -e "POSTGRES_PASSWORD=<your-postgres-password>" \
  -e "POSTGRES_ADMIN_USER=postgres" \
  -e "POSTGRES_ADMIN_PASSWORD=<your-postgres-password>" \
  -p 3000:3000 \
  ghcr.io/openwallet-foundation/didcomm-mediator-credo:latest
```

Make sure to use the correct tag. By default `latest` will be used which can have unexpected breakage. See the releases for the latest stable tag. Currently the last released tag is ![GitHub release (latest by date)](https://img.shields.io/github/v/release/openwallet-foundation/didcomm-mediator-credo?display_name=tag&label=tag)

You can also adapt the `apps/mediator/docker-compose.yml` file to your needs.

### Building the Docker Image

You can build the docker image using the following command:

```
docker build \
   -t ghcr.io/openwallet-foundation/didcomm-mediator-credo \
   -f Dockerfile \
   .
```

## Using Helm

### To deploy the application on Kubernetes using Helm, follow this [installation guide](/helm/README.md) containing

- Helm Chart structure
- Quick Note
- Helm Commands

## Roadmap

The contents in this repository started out as a simple mediator built using Credo that can be used for development. Over time we've added some features, but there's still a lot we want to add to this repository over time. Some things on the roadmap:

- Expose a `did:web` did, so you can directly connect to the mediator using only a did
- Allow for customizing the message queue implementation, so it doesn't have to be stored in the Askar database, but rather in high-volume message queue like Kafka.
- DIDComm v2 support
- Sending push notifications to the recipient when a message is queued for them
- Allow to control acceptance of mediation requests

## 🖇️ How To Contribute

You're welcome to contribute to this repository. Please make sure to open an issue first for bigger changes!

This mediator is open source and you're more than welcome to customize and use it to create your own mediator.

## License

The DIDComm Mediator Credo is licensed under the Apache License Version 2.0 (Apache-2.0).
