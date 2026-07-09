CREATE TYPE "public"."discord_role_sync_status" AS ENUM('assigned', 'failed', 'removed');--> statement-breakpoint
CREATE TABLE "group_application_access" (
	"group_id" text NOT NULL,
	"application_id" text NOT NULL,
	CONSTRAINT "group_application_access_pkey" PRIMARY KEY("group_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "group_discord_roles" (
	"group_id" text NOT NULL,
	"discord_role_id" text NOT NULL,
	"discord_role_name" text NOT NULL,
	CONSTRAINT "group_discord_roles_pkey" PRIMARY KEY("group_id","discord_role_id")
);
--> statement-breakpoint
CREATE TABLE "group_roles" (
	"group_id" text NOT NULL,
	"role_id" text NOT NULL,
	CONSTRAINT "group_roles_pkey" PRIMARY KEY("group_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_discord_role_syncs" (
	"member_id" text NOT NULL,
	"discord_role_id" text NOT NULL,
	"discord_role_name" text NOT NULL,
	"status" "discord_role_sync_status" NOT NULL,
	"error_message" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_discord_role_syncs_pkey" PRIMARY KEY("member_id","discord_role_id")
);
--> statement-breakpoint
CREATE TABLE "member_discord_roles" (
	"member_id" text NOT NULL,
	"discord_role_id" text NOT NULL,
	"discord_role_name" text NOT NULL,
	"source" text DEFAULT 'onboarding' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_discord_roles_pkey" PRIMARY KEY("member_id","discord_role_id")
);
--> statement-breakpoint
CREATE TABLE "member_groups" (
	"member_id" text NOT NULL,
	"group_id" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_groups_pkey" PRIMARY KEY("member_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_default_application_access" (
	"application_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_default_discord_roles" (
	"discord_role_id" text PRIMARY KEY NOT NULL,
	"discord_role_name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_application_access" ADD CONSTRAINT "group_application_access_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_application_access" ADD CONSTRAINT "group_application_access_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_discord_roles" ADD CONSTRAINT "group_discord_roles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_roles" ADD CONSTRAINT "group_roles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_roles" ADD CONSTRAINT "group_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_discord_role_syncs" ADD CONSTRAINT "member_discord_role_syncs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_discord_roles" ADD CONSTRAINT "member_discord_roles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_granted_by_members_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_default_application_access" ADD CONSTRAINT "onboarding_default_application_access_application_id_access_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."access_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_name_lower_unique" ON "groups" USING btree (lower("name"));