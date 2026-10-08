CREATE TABLE "expense_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"expense_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	CONSTRAINT "expense_photos_is_image" CHECK ("expense_photos"."mime_type" like 'image/%'),
	CONSTRAINT "expense_photos_size_not_negative" CHECK ("expense_photos"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expense_photos" ADD CONSTRAINT "expense_photos_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_photos" ADD CONSTRAINT "expense_photos_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_photos_expense_idx" ON "expense_photos" USING btree ("expense_id");