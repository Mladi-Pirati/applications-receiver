ALTER TABLE "members" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "place_of_birth" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "residence_region" text;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_application_id_membership_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."mladi_pirati_membership_applications"("id") ON DELETE set null ON UPDATE no action;