CREATE TABLE "discord_link_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_link_tokens" ADD CONSTRAINT "discord_link_tokens_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_link_tokens_member_id_idx" ON "discord_link_tokens" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_link_tokens_token_unique" ON "discord_link_tokens" USING btree ("token");