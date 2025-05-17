# DynamoDB Message Pickup repository for Credo

## Overview

This package provides a simple but efficient Message Pickup Repository implementation to use with a [Credo](https://github.com/openwallet-foundation/credo-ts) mediator that wishes to persist queued messages for offline users in a shared database that will allow using multiple Credo instances.

## Installation

This module is designed to work with Credo 0.6.x. Newer versions may include breaking changes in its API and therefore would require code updates to this module.

To use it, install package in your DIDComm Mediator application. For example:

```bash
npm i @credo-ts/didcomm-message-pickup-dynamodb
```

or

```bash
yarn add @credo-ts/didcomm-message-pickup-dynamodb
```
