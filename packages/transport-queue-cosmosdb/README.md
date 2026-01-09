# DIDComm Transport Queue (Azure Cosmos DB) for Credo

## Overview

This package provides a Transport Queue implementation to use with a [Credo](https://github.com/openwallet-foundation/credo-ts) mediator that persists queued messages for offline users in Azure Cosmos DB. This enables deploying the mediator on Microsoft Azure with a globally distributed, highly available NoSQL database.

## Features

- **Azure Native**: Designed specifically for Azure Cosmos DB, Microsoft's globally distributed NoSQL database
- **Scalable**: Cosmos DB automatically scales throughput and storage as needed
- **High Availability**: Built-in global distribution and multi-region write capabilities
- **Low Latency**: Single-digit millisecond read and write latencies at any scale
- **Partition Key Optimization**: Uses `connectionId` as the partition key for efficient message retrieval per connection

## Installation

This module is designed to work with Credo 0.6.x. Newer versions may include breaking changes in its API and therefore would require code updates to this module.

To use it, install the package in your DIDComm Mediator application:

```bash
npm i @credo-ts/didcomm-transport-queue-cosmosdb
```

or

```bash
yarn add @credo-ts/didcomm-transport-queue-cosmosdb
```

or

```bash
pnpm add @credo-ts/didcomm-transport-queue-cosmosdb
```

## Configuration

### Basic Configuration

```json
{
  "messagePickup": {
    "storage": {
      "type": "cosmosdb",
      "endpoint": "https://your-account.documents.azure.com:443/",
      "key": "your-primary-or-secondary-key",
      "databaseName": "didcomm-mediator",
      "containerName": "queued_messages"
    }
  }
}
```

### Environment Variables

You can also configure the Cosmos DB connection using environment variables:

- `MESSAGE_PICKUP__STORAGE__TYPE`: Set to `cosmosdb`
- `MESSAGE_PICKUP__STORAGE__ENDPOINT`: Cosmos DB endpoint URL
- `MESSAGE_PICKUP__STORAGE__KEY`: Cosmos DB account key
- `MESSAGE_PICKUP__STORAGE__DATABASE_NAME`: Database name (optional, defaults to `didcomm-mediator`)
- `MESSAGE_PICKUP__STORAGE__CONTAINER_NAME`: Container name (optional, defaults to `queued_messages`)

### Full Azure Deployment Example

See [azure.json](../../apps/mediator/samples/azure.json) for a complete Azure deployment configuration example that includes:

- Azure Cosmos DB for message pickup storage
- Azure Cache for Redis for caching
- Azure Database for PostgreSQL for Askar storage

## Usage

```typescript
import { DidCommTransportQueueCosmosDb } from '@credo-ts/didcomm-transport-queue-cosmosdb'

const messagePickupRepository = await DidCommTransportQueueCosmosDb.initialize({
  endpoint: 'https://your-account.documents.azure.com:443/',
  key: 'your-cosmos-db-key',
  databaseName: 'didcomm-mediator',
  containerName: 'queued_messages',
  logger: yourLoggerInstance,
})

// Use with your Credo agent configuration
```

## Azure Setup

### 1. Create a Cosmos DB Account

1. Go to the [Azure Portal](https://portal.azure.com)
2. Create a new Azure Cosmos DB account
3. Select "NoSQL" as the API
4. Configure your capacity mode (Serverless or Provisioned throughput)
5. Enable or disable global distribution based on your needs

### 2. Get Connection Details

1. Navigate to your Cosmos DB account in Azure Portal
2. Go to "Keys" under "Settings"
3. Copy the URI (endpoint) and PRIMARY KEY or SECONDARY KEY

### 3. Database and Container

The package will automatically create the database and container if they don't exist. The container is configured with:

- **Partition Key**: `/connectionId` - optimizes queries for message retrieval per connection
- **Indexing Policy**: Optimized for the query patterns used by the mediator

## Local Development

For local development, you can use the [Azure Cosmos DB Emulator](https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator):

```json
{
  "messagePickup": {
    "storage": {
      "type": "cosmosdb",
      "endpoint": "https://localhost:8081",
      "key": "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
    }
  }
}
```

The emulator uses a well-known key for development purposes.
