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

### Mediator Settings

| Name                                         | Description                                                                                                                                                                      | Value                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `replicaCount`                               | This will set the replicaset count more information can be found here: https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/                                     | `1`                                                             |
| `image.repository`                           |                                                                                                                                                                                  | `ghcr.io/openwallet-foundation/didcomm-mediator-credo/mediator` |
| `image.pullPolicy`                           |                                                                                                                                                                                  | `Always`                                                        |
| `image.tag`                                  | Overrides the image tag which defaults to the chart appVersion.                                                                                                                  | `""`                                                            |
| `imagePullSecrets`                           |                                                                                                                                                                                  | `[]`                                                            |
| `nameOverride`                               | String to override the helm chart name, second part of the prefix.                                                                                                               | `""`                                                            |
| `fullnameOverride`                           | String to fully override the helm chart name, full prefix. *Must be provided if using a custom release name that does not include the name of the helm chart (`vc-authn-oidc`).* | `""`                                                            |
| `serviceAccount.create`                      | Specifies whether a ServiceAccount should be created                                                                                                                             | `true`                                                          |
| `serviceAccount.annotations`                 | Annotations for service account. Evaluated as a template. Only used if `create` is `true`.                                                                                       | `{}`                                                            |
| `serviceAccount.automount`                   | Automount service account token for the server service account                                                                                                                   | `true`                                                          |
| `serviceAccount.name`                        | Name of the service account to use. If not set and create is true, a name is generated using the fullname template.                                                              | `""`                                                            |
| `podAnnotations`                             | Map of annotations to add to the mediator pods                                                                                                                                   | `{}`                                                            |
| `podLabels`                                  | Map of labels to add to the mediator pods                                                                                                                                        | `{}`                                                            |
| `podSecurityContext`                         | Pod Security Context                                                                                                                                                             | `{}`                                                            |
| `securityContext`                            | Container Security Context                                                                                                                                                       | `{}`                                                            |
| `service.type`                               | Kubernetes Service type                                                                                                                                                          | `ClusterIP`                                                     |
| `service.port`                               |                                                                                                                                                                                  | `3000`                                                          |
| `ingress.enabled`                            | Enable ingress record generation for controller                                                                                                                                  | `true`                                                          |
| `ingress.className`                          | IngressClass that will be be used to implement the Ingress (Kubernetes 1.18+)                                                                                                    | `""`                                                            |
| `ingress.annotations`                        | Additional annotations for the Ingress resource.                                                                                                                                 | `nil`                                                           |
| `ingress.hosts`                              | List of hosts to be configured for the specified ingress record.                                                                                                                 | `[]`                                                            |
| `ingress.tls`                                | Enable TLS configuration for the host defined at ingress.                                                                                                                        | `[]`                                                            |
| `networkPolicy.enabled`                      | Enable network policies                                                                                                                                                          | `true`                                                          |
| `networkPolicy.ingress.enabled`              | Enable ingress rules                                                                                                                                                             | `true`                                                          |
| `networkPolicy.ingress.namespaceSelector`    | Namespace selector label that is allowed to access the Tenant proxy pods.                                                                                                        | `{}`                                                            |
| `networkPolicy.ingress.podSelector`          | Pod selector label that is allowed to access the Tenant proxy pods.                                                                                                              | `{}`                                                            |
| `resources`                                  | CPU/Memory resource requests/limits - unset by default                                                                                                                           | `{}`                                                            |
| `environment`                                | Variables to be passed to the container                                                                                                                                          | `[]`                                                            |
| `livenessProbe`                              | Liveness probe configuration                                                                                                                                                     | `{}`                                                            |
| `readinessProbe`                             | Readiness probe configuration                                                                                                                                                    | `{}`                                                            |
| `autoscaling.enabled`                        | Enable Horizontal POD autoscaling for the Credo Mediator                                                                                                                         | `false`                                                         |
| `autoscaling.minReplicas`                    | Minimum number of replicas                                                                                                                                                       | `1`                                                             |
| `autoscaling.maxReplicas`                    | Maximum number of replicas                                                                                                                                                       | `100`                                                           |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU utilization percentage                                                                                                                                                | `80`                                                            |
| `volumes`                                    | List of volume claims to be created                                                                                                                                              | `[]`                                                            |
| `volumeMounts`                               | List of volumes to be mounted in the container                                                                                                                                   | `[]`                                                            |
| `nodeSelector`                               | Node labels for pods assignment                                                                                                                                                  | `{}`                                                            |
| `tolerations`                                | Tolerations for pods assignment                                                                                                                                                  | `[]`                                                            |
| `affinity`                                   | Affinity for pods assignment                                                                                                                                                     | `{}`                                                            |

### PostgreSQL parameters

| Name                                          | Description                                                               | Value  |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| `postgresql.commonLabels`                     | Add labels to all the deployed resources (sub-charts are not considered). | `[]`   |
| `postgresql.primary.service.ports.postgresql` | PostgreSQL service port                                                   | `5432` |

