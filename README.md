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

## Getting Started

> If you want to deploy the mediator based on the pre-built docker image, please see the [Using Docker](#using-docker) section.

Install dependencies:

```bash
pnpm install
```

And run dev to start the development server:

```bash
pnpm dev
```

To reach the mediator externally you need to set up an ngrok tunnel. To do this, create an `.env.local` file and add an `NGROK_AUTH_TOKEN`. Read more on obtaining an auth token here: https://dashboard.ngrok.com/get-started/your-authtoken.

### Connecting to the Mediator

When you've correctly started the mediator agent, and have extracted the invitation from the console, you can use the invitation to connect to the mediator agent. To connect to the mediator and start receiving messages, there's a few steps that need to be taken:

1. Connect to the mediator from another agent using the created [Out Of Band Invitation](https://github.com/hyperledger/aries-rfcs/blob/main/features/0434-outofband/README.md)
2. Request mediation from the mediator using the [Mediator Coordination Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0211-route-coordination).
3. Start picking up messages implicitly by connecting using a WebSocket and sending any DIDComm message to authenticate, the [Pickup V1 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0212-pickup), or the [Pickup V2 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0685-pickup-v2). We recommend using the Pickup V2 Protocol.

If you're using an Credo agent as the client, you can follow the [Mediation Tutorial](https://credo.js.org/guides/tutorials/mediation) from the Credo docs.

## Environment Variables

You can provide a number of environment variables to run the agent. The following table lists the environment variables that can be used.

The `POSTGRES_` variables won't be used in development mode (`NODE_ENV=development`), but are required when `NODE_ENV` is `production`.  
This makes local development easier, but ensures you have a persistent database when deploying.

| Variable                   | Description                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENT_ENDPOINTS`          | Comma-separated list of endpoints, in order of preference. In most cases you want to provide two endpoints, where the first one is an HTTP URL, and the second one is a WebSocket URL.                                                  |
| `AGENT_NAME`               | The name of the agent. This will be used in invitations and will be publicly advertised.                                                                                                                                                |
| `AGENT_PORT`               | The port that is exposed for incoming traffic. Both the HTTP and WS inbound transport handlers are exposed on this port, and HTTP traffic will be upgraded to the WebSocket server when applicable.                                      |
| `WALLET_NAME`              | The name of the wallet to use.                                                                                                                                                                                                          |
| `WALLET_KEY`               | The key to unlock the wallet.                                                                                                                                                                                                           |
| `INVITATION_URL`           | Optional URL that can be used as the base for the invitation URL. This allows you to render a web page that can extract the invitation from the `oob` parameter, and show a QR code or other useful information. Less applicable to mediators. |
| `POSTGRES_HOST`            | Host of the database to use. Should include both host and port.                                                                                                                                                                         |
| `POSTGRES_USER`            | The PostgreSQL user.                                                                                                                                                                                                                    |
| `POSTGRES_PASSWORD`        | The PostgreSQL password.                                                                                                                                                                                                                |
| `POSTGRES_ADMIN_USER`      | The PostgreSQL admin user.                                                                                                                                                                                                              |
| `POSTGRES_ADMIN_PASSWORD`  | The PostgreSQL admin password.                                                                                                                                                                                                          |
| `USE_PUSH_NOTIFICATIONS`   | Boolean flag that informs the system it should send push notifications.                                   |                                                                                                                              |
| `FIREBASE_APPS`             | An array of firebase apps configuration objects [{ "projectId": "test-project", "clientEmail": "test-email", "privateKey": "test-key" }]
| `NOTIFICATION_WEBHOOK_URL` | (Optional) A URL used for sending notifications to an external service.                                                                                                                                                                 |
| `CREATE_NEW_INVITATION`    | Boolean flag that informs the system to create a new invitation on startup. Defaults to `false`.                                                                                                                                        |
| `GOAL_CODE`                | The goal code that will be used for the mediator. Can be set to `mediator`.                                                                                                                                                             |
| `NODE_OPTIONS`             | Options to pass to Node.js runtime. We recommend setting this to `--max-old-space-size=512` to limit the memory usage of the agent.                                                                                                     |
| `MALLOC_CONF`              | Options to pass to the memory allocator. We recommend setting this to `background_thread:true,metadata_thp:auto` to improve performance.                                                                                                |
| `LD_PRELOAD`               | Preload the jemalloc memory allocator. We recommend setting this to `/usr/lib/x86_64-linux-gnu/libjemalloc.so.2` to improve performance.                                                                                                |

## Postgres Database

To deploy the mediator, a postgres database is required. Any postgres database will do.

1. Create a postgres database and make sure it is publicly exposed.
2. Set the `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_USER`, `POSTGRES_ADMIN_PASSWORD` variables. For the mediator we use the same username and password for the admin user and the regular user, but you might want to create a separate user for the admin user.

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

You can also adapt the `docker-compose.yml` file to your needs.

### Building the Docker Image

You can build the docker image using the following command:

```
docker build \
   -t ghcr.io/openwallet-foundation/didcomm-mediator-credo \
   -f Dockerfile \
   .
```

## Pickup Strategy

You can configure the pickup strategy of the mediator by setting the following environment variables. The following strategies are available:
| Strategy        | Description                                                                                      |
|------------------|--------------------------------------------------------------------------------------------------|
| `PICKUP_TYPE` | The current types available are `postgres` and if not set, the default is `in-memory`. The `postgres` strategy will store the messages in a postgres database, while the `in-memory` strategy will store the messages in memory. The `in-memory` strategy is not recommended for production use, as it will lose all messages when the mediator is restarted. |
| `PICKUP_STRATEGY` | The current strategies `DirectDelivery`, `QueueOnly`, and `QueueAndLiveModeDelivery`. The `DirectDelivery` strategy will deliver messages directly to the recipient, while the `QueueOnly` strategy will only queue the messages for the recipient. The `QueueAndLiveModeDelivery` strategy will queue the messages for the recipient and deliver them directly if possible. The default is `DirectDelivery`. |
| `PICKUP_SETTINGS` | The custom settings for the pickup strategy. This is a JSON string that can be used to configure the pickup strategy. For example, you can set the `useBaseConnection` setting to `true` to use the base connection for the postgres strategy. The default is `{}`. |

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
