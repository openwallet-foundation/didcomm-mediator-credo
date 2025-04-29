# DIDComm Mediator Credo

![Version: 0.2.0](https://img.shields.io/badge/Version-0.2.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 0.1.0](https://img.shields.io/badge/AppVersion-0.1.0-informational?style=flat-square)

A Helm chart to deploy the DIDComm Mediator Credo service.

## TL;DR

```console
helm install my-release charts/mediator
```

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner support in the underlying infrastructure

## Installing the Chart

To install the chart with the release name `my-release`:

```console
helm install my-release charts/mediator
```


## Uninstalling the Chart

To uninstall/delete the `my-release` deployment:

```console
helm delete my-release
```

The command removes all the Kubernetes components but secrets and PVC's associated with the chart and deletes the release.

To delete the secrets and PVC's associated with `my-release`:

```console
kubectl delete secret,pvc --selector "app.kubernetes.io/instance"=my-release
```

## Parameters
