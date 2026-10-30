CREATE TABLE "group_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"group_id" uuid NOT NULL,
	"since" timestamp with time zone NOT NULL,
	CONSTRAINT "group_deletions_group" UNIQUE("group_id")
);
--> statement-breakpoint
ALTER TABLE "group_deletions" ADD CONSTRAINT "group_deletions_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_deletions" ADD CONSTRAINT "group_deletions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;