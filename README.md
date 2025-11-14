<h1 align="center" ><b>CREDEBL Mediator</b></h1>

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

This repo contains a [Mediator](https://github.com/hyperledger/aries-rfcs/blob/main/concepts/0046-mediators-and-relays/README.md) Agent for usage with [Hyperledger Aries and DIDComm v1 agents](https://github.com/hyperledger/aries-rfcs/tree/main/concepts/0004-agents). It is built using [Aries Framework JavaScript](https://github.com/hyperledger/aries-framework-javascript).

Why should you use this mediator?

- Automatically set up mediation with the mediator using the [Mediator Coordination Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0211-route-coordination).
- Pick up messages implicitly using WebSockets, using the [Pickup V1 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0212-pickup), and the [Pickup V2 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0685-pickup-v2).
- Configured to persist queued messages for recipient in a postgres.
- Use the pre-built docker image for easy deployment of your mediator.

## Getting Started

> If you want to deploy the mediator based on the pre-built docker image, please see the [Using Docker](#using-docker) section.

Install dependencies:

```bash
yarn install
```

And run dev to start the development server:

```bash
yarn dev
```

In development, the `dev.ts` script will be used which will automatically set up an ngrok tunnel for you and start the mediator agent with some default values. There's no need to configure any environment variables.

To start the server in production, you can run the following command. Make sure to set the environment variables as described below.

```bash
yarn start
```

After the agent is started, a multi-use invitation will be printed to the console.

### Connecting to the Mediator

When you've correctly started the mediator agent, and have extracted the invitation from the console, you can use the invitation to connect to the mediator agent. To connect to the mediator and start receiving messages, there's a few steps that need to be taken:

1. Connect to the mediator from another agent using the created [Out Of Band Invitation](https://github.com/hyperledger/aries-rfcs/blob/main/features/0434-outofband/README.md)
2. Request mediation from the mediator using the [Mediator Coordination Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0211-route-coordination).
3. Start picking up messages implicitly by connecting using a WebSocket and sending any DIDComm message to authenticate, the [Pickup V1 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0212-pickup), or the [Pickup V2 Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0685-pickup-v2). We recommend using the Pickup V2 Protocol.

If you're using an Aries Framework JavaScript agent as the client, you can follow the [Mediation Tutorial](https://aries.js.org/guides/next/tutorials/mediation) from the Aries Framework JavaScript docs. Please note, the tutorial points to the `next` version, which is for `0.4.0` at the time of writing. If the link stops working, please check the `0.4.0` docs for the tutorial.

## Environment Variables

You can provide a number of environment variables to run the agent. The following table lists the environment variables that can be used.

The `POSTGRES_` variables won't be used in development mode (`NODE_ENV=development`), but are required when `NODE_ENV` is `production`. This makes local development easier, but makes sure you have a persistent database when deploying.

| Variable                  | Description                                                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENT_ENDPOINTS`         | Comma separated list of endpoints, in order of preference. In most cases you want to provide two endpoints, where the first one is an HTTP url, and the second one is an WebSocket url                                                                                            |
| `AGENT_NAME`              | The name of the agent. This will be used in invitations and will be publicly advertised.                                                                                                                                                                                          |
| `AGENT_PORT`              | The port that is exposed for incoming traffic. Both the HTTP and WS inbound transport handlers are exposes on this port, and HTTP traffic will be upgraded to the WebSocket server when applicable.                                                                               |
| `WALLET_NAME`             | The name of the wallet to use.                                                                                                                                                                                                                                                    |
| `WALLET_KEY`              | The key to unlock the wallet.                                                                                                                                                                                                                                                     |
| `INVITATION_URL`          | Optional URL that can be used as the base for the invitation url. This would allow you to render a certain web page that can extract the invitation form the `oob` parameter, and show the QR code, or show useful information to the end-user. Less applicable to mediator URLs. |
| `POSTGRES_HOST`           | Host of the database to use. Should include both host and port.                                                                                                                                                                                                                   |
| `POSTGRES_USER`           | The postgres user.                                                                                                                                                                                                                                                                |
| `POSTGRES_PASSWORD`       | The postgres password.                                                                                                                                                                                                                                                            |
| `POSTGRES_ADMIN_USER`     | The postgres admin user.                                                                                                                                                                                                                                                          |
| `POSTGRES_ADMIN_PASSWORD` | The postgres admin password.                                                                                                                                                                                                                                                      |

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
  mediator-agent:latest
```

Make sure to use the correct tag. By default `latest` will be used which can have unexpected breakage.

You can also adapt the `docker-compose.yml` file to your needs.

### Building the Docker Image

You can build the docker image using the following command:

```
docker build \
   -t mediator-agent \
   -f Dockerfile \
   .
```

## Roadmap

The contents in this repository started out as a simple mediator built using Aries Framework JavaScript that can be used for development. Over time we've added some features, but there's still a lot we want to add to this repository over time. Some things on the roadmap:

- Expose a `did:web` did, so you can directly connect to the mediator using only a did
- Allow for customizing the message queue implementation, so it doesn't have to be stored in the Askar database, but rather in high-volume message queue like Kafka.
- DIDComm v2 support
- Sending push notifications to the recipient when a message is queued for them
- Allow to control acceptance of mediation requests

## 🖇️ How To Contribute

You're welcome to contribute to this repository. Please make sure to open an issue first for bigger changes!

This mediator is open source and you're more than welcome to customize and use it to create your own mediator.

## License

This Mediator is licensed under the [Apache License 2.0](https://github.com/animo/animo-mediator/blob/main/LICENSE).
