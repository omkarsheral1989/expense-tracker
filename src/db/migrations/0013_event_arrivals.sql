CREATE TABLE "event_arrivals" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_arrivals" ADD CONSTRAINT "event_arrivals_event_id_expense_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."expense_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "event_arrivals" ("event_id", "arrived_at") SELECT "id", now() FROM "expense_events";
