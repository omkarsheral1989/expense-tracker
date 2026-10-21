CREATE TABLE "sync_status" (
	"scope" text PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL
);
