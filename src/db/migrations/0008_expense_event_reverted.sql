ALTER TABLE "expense_events" DROP CONSTRAINT "expense_events_kind";--> statement-breakpoint
ALTER TABLE "expense_events" ADD COLUMN "restored_from" uuid;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_restored_from_expense_events_id_fk" FOREIGN KEY ("restored_from") REFERENCES "public"."expense_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_kind" CHECK ("expense_events"."kind" in ('added', 'edited', 'deleted', 'restored', 'reverted'));