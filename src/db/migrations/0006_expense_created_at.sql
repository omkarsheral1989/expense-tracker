ALTER TABLE "expenses" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- An expense never edited was last changed when it was added.
UPDATE "expenses" SET "created_at" = "updated_at";
--> statement-breakpoint
-- An edited one was added before its first edit: that is the earliest time known.
UPDATE "expenses" SET "created_at" = "first_edit"."at" FROM (SELECT "expense_id", min("edited_at") AS "at" FROM "expense_revisions" GROUP BY "expense_id") AS "first_edit" WHERE "first_edit"."expense_id" = "expenses"."id" AND "first_edit"."at" < "expenses"."created_at";
