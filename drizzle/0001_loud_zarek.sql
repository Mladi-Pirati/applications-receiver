ALTER TABLE "users" ADD COLUMN "force_password_change" boolean;--> statement-breakpoint
UPDATE "users"
SET "force_password_change" = false
WHERE "force_password_change" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "force_password_change" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "force_password_change" SET NOT NULL;
