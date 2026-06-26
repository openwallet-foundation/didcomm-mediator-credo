# Makefile for building and deploying the DIDComm Mediator image to ECR.

# AWS profile: pass via `make deploy-qa PROFILE=myprofile`.
# Priority 1: --profile flag (PROFILE var). Otherwise falls back to the
# AWS_* env vars in the current shell session.
PROFILE ?=
AWS_PROFILE_FLAG := $(if $(PROFILE),--profile $(PROFILE),)

AWS_REGION ?= ap-southeast-1
ECR_REPO   ?= qa-services

# ECS targets (no account id hardcoded; resolved at runtime).
ECS_CLUSTER   ?= QA-NGOTAG-CLUSTER
ECS_SERVICE   ?= animo-mediator
ECS_TASK_DEF_FAMILY ?= QA-ANIMO-MEDIATOR-TDF

# Short git hash of HEAD (7 chars).
GIT_HASH := $(shell git rev-parse --short=7 HEAD)
GIT_SHA  := $(shell git rev-parse HEAD)
IMAGE_TAG := didcomm-mediator-$(GIT_HASH)

# Account id resolved from the selected profile (or env credentials).
ACCOUNT_ID = $(shell aws sts get-caller-identity $(AWS_PROFILE_FLAG) --query Account --output text)
REGISTRY   = $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
REMOTE_IMAGE = $(REGISTRY)/$(ECR_REPO):$(IMAGE_TAG)
LOCAL_IMAGE  = $(ECR_REPO):$(IMAGE_TAG)

.PHONY: deploy-qa
deploy-qa:
	@echo ">> Resolving AWS account..."
	$(eval RESOLVED_ACCOUNT := $(ACCOUNT_ID))
	@test -n "$(RESOLVED_ACCOUNT)" || (echo "ERROR: could not resolve AWS account id (check --profile or AWS_* env vars)" && exit 1)
	@echo ">> Account: $(RESOLVED_ACCOUNT)  Image: $(REMOTE_IMAGE)"

	@echo ">> Logging in to ECR..."
	aws ecr get-login-password $(AWS_PROFILE_FLAG) --region $(AWS_REGION) \
		| docker login --username AWS --password-stdin $(REGISTRY)

	@echo ">> Building image..."
	docker build -f apps/mediator/Dockerfile -t $(LOCAL_IMAGE) .

	@echo ">> Tagging image..."
	docker tag $(LOCAL_IMAGE) $(REMOTE_IMAGE)

	@echo ">> Pushing image..."
	docker push $(REMOTE_IMAGE)

	@echo ">> Image pushed: $(REMOTE_IMAGE)"
	@$(MAKE) gh-release
	@$(MAKE) deploy-ecs REMOTE_IMAGE=$(REMOTE_IMAGE)

# owner/repo from origin remote (handles https and ssh URLs).
GH_REPO = $(shell git config --get remote.origin.url | sed -E 's,git@github.com:,,; s,https://github.com/,,; s,\.git$$,,')

.PHONY: gh-release
gh-release:
	@command -v gh >/dev/null || (echo "ERROR: gh CLI is required" && exit 1)
	@echo ">> Creating GitHub release qa-$(GIT_HASH) on $(GH_REPO)..."
	gh release create qa-$(GIT_HASH) \
		--repo $(GH_REPO) \
		--title "qa-$(GIT_HASH)" \
		--target $(GIT_SHA) \
		--generate-notes

.PHONY: deploy-ecs
deploy-ecs:
	@command -v jq >/dev/null || (echo "ERROR: jq is required" && exit 1)
	@test -n "$(REMOTE_IMAGE)" || (echo "ERROR: REMOTE_IMAGE not set" && exit 1)
	@echo ">> Fetching latest task definition for $(ECS_TASK_DEF_FAMILY)..."
	@set -e; \
	tmp=$$(mktemp); \
	aws ecs describe-task-definition $(AWS_PROFILE_FLAG) --region $(AWS_REGION) \
		--task-definition $(ECS_TASK_DEF_FAMILY) \
		--query 'taskDefinition' --output json \
	| jq --arg img "$(REMOTE_IMAGE)" '\
		del(.taskDefinitionArn, .revision, .status, .requiresAttributes, \
		    .compatibilities, .registeredAt, .registeredBy, .deregisteredAt) \
		| .runtimePlatform = (.runtimePlatform // {}) \
		| .runtimePlatform.cpuArchitecture = "ARM64" \
		| .runtimePlatform.operatingSystemFamily = (.runtimePlatform.operatingSystemFamily // "LINUX") \
		| .containerDefinitions[].image = $$img \
	' > $$tmp; \
	echo ">> Registering new task definition (ARM64, image=$(REMOTE_IMAGE))..."; \
	new_arn=$$(aws ecs register-task-definition $(AWS_PROFILE_FLAG) --region $(AWS_REGION) \
		--cli-input-json file://$$tmp \
		--query 'taskDefinition.taskDefinitionArn' --output text); \
	rm -f $$tmp; \
	echo ">> Registered: $$new_arn"; \
	echo ">> Updating service $(ECS_SERVICE) on $(ECS_CLUSTER)..."; \
	aws ecs update-service $(AWS_PROFILE_FLAG) --region $(AWS_REGION) \
		--cluster $(ECS_CLUSTER) --service $(ECS_SERVICE) \
		--task-definition $$new_arn \
		--query 'service.{service:serviceName,taskDef:taskDefinition}' --output table; \
	echo ">> Done."
