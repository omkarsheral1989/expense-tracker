CREATE TABLE "expense_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"expense_id" uuid NOT NULL,
	"edited_by" uuid NOT NULL,
	"edited_at" timestamp with time zone NOT NULL,
	"before" jsonb NOT NULL,
	"changes" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_edited_by_people_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_revisions_expense_idx" ON "expense_revisions" USING btree ("expense_id");