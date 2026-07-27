ALTER TABLE "members" ADD COLUMN "discord_user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "members_discord_user_id_unique" ON "members" USING btree ("discord_user_id");