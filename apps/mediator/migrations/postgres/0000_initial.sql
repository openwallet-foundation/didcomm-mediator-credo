CREATE TABLE "PushNotificationsFcm" (
	"context_correlation_id" text NOT NULL,
	"id" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"metadata" jsonb,
	"custom_tags" jsonb,
	"device_token" text,
	"device_platform" text,
	"connection_id" text NOT NULL,
	CONSTRAINT "pushNotificationsFcm_pk" PRIMARY KEY("context_correlation_id","id")
);
--> statement-breakpoint
ALTER TABLE "PushNotificationsFcm" ADD CONSTRAINT "pushNotificationsFcm_fk_context" FOREIGN KEY ("context_correlation_id") REFERENCES "public"."Context"("context_correlation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "PushNotificationsFcm" ADD CONSTRAINT "PushNotificationsFcm_context_correlation_id_connection_id_DidcommConnection_context_correlation_id_id_fk" FOREIGN KEY ("context_correlation_id","connection_id") REFERENCES "public"."DidcommConnection"("context_correlation_id","id") ON DELETE cascade ON UPDATE no action;