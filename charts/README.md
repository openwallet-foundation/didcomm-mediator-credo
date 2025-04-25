# Installing DIDComm Mediator Credo on k8s with Helm

### Three manifest files are used in Helm charts
1. Deployment.yaml
This file contains the replicaset, container image name, container port, and environment variables for the container. This will create a Deployment type object for the application.

2. Service.yaml
The service file is to create a service-type object to connect with the pods and to access the application by redirecting traffic through it without exposing the pod directly.

3. Ingress.yaml
Ingress is one layer on top of the service that will connect with the load balancer to redirect the traffic to the service. If multiple services are present, it can also redirect traffic to them by path-based routing. Similar to a service, it will redirect the traffic to the service without exposing it.

## Helm Chart Note
- The values.yaml file contains 4 sections: Common Values, Deployment Values, Service Values, and Ingress Values.
- These values will be passed inside the manifest files in the templates folder.
- Deployment env values should be replaced with your values in the values.yaml file's Deployment Values environment section.

## Helm Commands to Install the Application.
- Installing the application from the root directory with default values of the values.yaml file.
```bash
helm install YOUR_HELM_RELEASE_NAME ./helm/mediator/
```

- Changing the values as needed
```bash
helm install YOUR_HELM_RELEASE_NAME ./helm/mediator/ --set KEY=VALUE
```
- Changing multiple values
```bash
helm install YOUR_HELM_RELEASE_NAME ./helm/mediator/ --set KEY1=VALUE1,KEY2=VALUE2
```

- After installing, you can upgrade the values with the ```helm upgrade``` command.
```bash
helm upgrade YOUR_HELM_RELEASE_NAME ./helm/mediator/ --set KEY=VALUE
```
```bash
helm upgrade YOUR_HELM_RELEASE_NAME ./helm/mediator/ --set KEY1=VALUE1,KEY2=VALUE2
```