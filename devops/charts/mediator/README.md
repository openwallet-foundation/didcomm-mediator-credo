```console
export NAMESPACE=$(oc project --short)
```

```console
export TRACTION_LEGACY_DID=$(oc get secret/bcwallet-attestation-controller-traction-creds -o json -n $NAMESPACE| jq -r ".data.TRACTION_LEGACY_DID"|base64 -d)
```

```console
export TRACTION_TENANT_ID=$(oc get secret/bcwallet-attestation-controller-traction-creds -o json -n $NAMESPACE| jq -r ".data.TRACTION_TENANT_ID"|base64 -d)
```

```console
export TRACTION_TENANT_API_KEY=$(oc get secret/bcwallet-attestation-controller-traction-creds -o json -n $NAMESPACE| jq -r ".data.TRACTION_TENANT_API_KEY"|base64 -d)
```

```console
helm install bcwallet ./devops/charts/controller -f ./devops/charts/controller/values_test.yaml --set-string tenant_id="$TRACTION_TENANT_ID" --set-string tenant_api_key="$TRACTION_TENANT_API_KEY" --set-string traction_legacy_did=$TRACTION_LEGACY_DID --set-string namespace=$NAMESPACE --set-file google_oauth_key.json=./google_oauth_key.json
```
