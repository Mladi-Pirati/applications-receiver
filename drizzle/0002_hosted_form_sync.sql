DROP TABLE "mladi_pirati_membership_applications";
--> statement-breakpoint
CREATE TABLE "mladi_pirati_membership_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"place_of_birth" text NOT NULL,
	"street_address" text NOT NULL,
	"city_and_postal_code" text NOT NULL,
	"residence_region" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"participation_mode" text NOT NULL,
	"discord_username" text,
	"motivation" text,
	"consents_to_data_processing" boolean NOT NULL,
	"accepts_statute_and_program" boolean NOT NULL,
	"status" "membership_application_status" DEFAULT 'new' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
