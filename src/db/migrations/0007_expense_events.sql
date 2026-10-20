CREATE TABLE "expense_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"group_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"acted_by" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "expense_events_kind" CHECK ("expense_events"."kind" in ('added', 'edited', 'deleted', 'restored'))
);
--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_acted_by_people_id_fk" FOREIGN KEY ("acted_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_events_expense_idx" ON "expense_events" USING btree ("expense_id","occurred_at");--> statement-breakpoint
CREATE INDEX "expense_events_group_idx" ON "expense_events" USING btree ("group_id","occurred_at");
--> statement-breakpoint
-- Copy what exists into events, so no history is lost (ADR-042). The expense as it is now:
-- an expense added: its first revision's "before", or, never edited, the expense as it is now.
INSERT INTO "expense_events" ("group_id", "expense_id", "kind", "acted_by", "occurred_at", "snapshot", "changes", "updated_by", "updated_at")
SELECT e."group_id", e."id", 'added', e."created_by", e."created_at",
  coalesce((SELECT r."before" FROM "expense_revisions" r WHERE r."expense_id" = e."id" ORDER BY r."edited_at", r."id" LIMIT 1), jsonb_build_object('description', e.description, 'category', e.category, 'amountMinor', e.amount_minor, 'currency', e.currency, 'date', e.date::text, 'notes', e.notes, 'method', e.method, 'shares', coalesce((SELECT jsonb_agg(jsonb_build_object('personId', s.person_id, 'paidMinor', s.paid_minor, 'owedMinor', s.owed_minor, 'inputValue', s.input_value) ORDER BY s.id) FROM expense_shares s WHERE s.expense_id = e.id AND s.deleted_at IS NULL), '[]'::jsonb), 'photos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'position', p.position, 'mimeType', p.mime_type, 'sizeBytes', p.size_bytes) ORDER BY p.position, p.id) FROM expense_photos p WHERE p.expense_id = e.id AND p.deleted_at IS NULL), '[]'::jsonb))),
  '[]'::jsonb, e."created_by", e."created_at"
FROM "expenses" e;
--> statement-breakpoint
-- an expense edited: the expense right after it is the next revision's "before", or, for the last edit, the expense as it is now.
INSERT INTO "expense_events" ("group_id", "expense_id", "kind", "acted_by", "occurred_at", "snapshot", "changes", "updated_by", "updated_at")
SELECT e."group_id", e."id", 'edited', r."edited_by", r."edited_at", coalesce(r."next_before", jsonb_build_object('description', e.description, 'category', e.category, 'amountMinor', e.amount_minor, 'currency', e.currency, 'date', e.date::text, 'notes', e.notes, 'method', e.method, 'shares', coalesce((SELECT jsonb_agg(jsonb_build_object('personId', s.person_id, 'paidMinor', s.paid_minor, 'owedMinor', s.owed_minor, 'inputValue', s.input_value) ORDER BY s.id) FROM expense_shares s WHERE s.expense_id = e.id AND s.deleted_at IS NULL), '[]'::jsonb), 'photos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'position', p.position, 'mimeType', p.mime_type, 'sizeBytes', p.size_bytes) ORDER BY p.position, p.id) FROM expense_photos p WHERE p.expense_id = e.id AND p.deleted_at IS NULL), '[]'::jsonb))), r."changes", r."edited_by", r."edited_at"
FROM "expenses" e
JOIN (SELECT x."expense_id", x."edited_by", x."edited_at", x."changes", lead(x."before") OVER (PARTITION BY x."expense_id" ORDER BY x."edited_at", x."id") AS "next_before" FROM "expense_revisions" x) r ON r."expense_id" = e."id";
--> statement-breakpoint
-- an expense that is deleted now: who and when are on the expense itself.
INSERT INTO "expense_events" ("group_id", "expense_id", "kind", "acted_by", "occurred_at", "snapshot", "changes", "updated_by", "updated_at")
SELECT e."group_id", e."id", 'deleted', e."updated_by", e."deleted_at", jsonb_build_object('description', e.description, 'category', e.category, 'amountMinor', e.amount_minor, 'currency', e.currency, 'date', e.date::text, 'notes', e.notes, 'method', e.method, 'shares', coalesce((SELECT jsonb_agg(jsonb_build_object('personId', s.person_id, 'paidMinor', s.paid_minor, 'owedMinor', s.owed_minor, 'inputValue', s.input_value) ORDER BY s.id) FROM expense_shares s WHERE s.expense_id = e.id AND s.deleted_at IS NULL), '[]'::jsonb), 'photos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'position', p.position, 'mimeType', p.mime_type, 'sizeBytes', p.size_bytes) ORDER BY p.position, p.id) FROM expense_photos p WHERE p.expense_id = e.id AND p.deleted_at IS NULL), '[]'::jsonb)), '[]'::jsonb, e."updated_by", e."deleted_at"
FROM "expenses" e WHERE e."deleted_at" IS NOT NULL;
