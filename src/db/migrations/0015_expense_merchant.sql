ALTER TABLE "expenses" ADD COLUMN "merchant" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_merchant_length" CHECK (char_length("expenses"."merchant") between 1 and 60);