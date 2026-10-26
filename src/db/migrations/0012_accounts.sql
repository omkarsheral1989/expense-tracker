CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"statement_day" integer,
	"credit_limit_minor" bigint,
	"spend_target_minor" bigint,
	"spend_target_period" text,
	CONSTRAINT "accounts_name_length" CHECK (char_length("accounts"."name") between 1 and 60),
	CONSTRAINT "accounts_currency_format" CHECK ("accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "accounts_kind_valid" CHECK ("accounts"."kind" in ('bank', 'card')),
	CONSTRAINT "accounts_statement_day_range" CHECK ("accounts"."statement_day" is null or "accounts"."statement_day" between 1 and 28),
	CONSTRAINT "accounts_amounts_positive" CHECK (("accounts"."credit_limit_minor" is null or "accounts"."credit_limit_minor" > 0) and ("accounts"."spend_target_minor" is null or "accounts"."spend_target_minor" > 0)),
	CONSTRAINT "accounts_spend_target_period_valid" CHECK (("accounts"."spend_target_minor" is null) = ("accounts"."spend_target_period" is null) and ("accounts"."spend_target_period" is null or "accounts"."spend_target_period" in ('month', 'quarter'))),
	CONSTRAINT "accounts_card_only_columns" CHECK ("accounts"."kind" = 'card' or ("accounts"."statement_day" is null and "accounts"."credit_limit_minor" is null and "accounts"."spend_target_minor" is null))
);
--> statement-breakpoint
CREATE TABLE "expense_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"expense_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"charged_minor" bigint,
	CONSTRAINT "expense_payments_expense" UNIQUE("expense_id"),
	CONSTRAINT "expense_payments_charged_positive" CHECK ("expense_payments"."charged_minor" is null or "expense_payments"."charged_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_payments_account_idx" ON "expense_payments" USING btree ("account_id");