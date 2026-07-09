import { z } from "zod";

export const discordUserIdSchema = z
  .string()
  .trim()
  .regex(
    /^\d{17,20}$/,
    "Enter a valid Discord user ID (17–20 digits). You can copy it from Discord with developer mode enabled.",
  );

export type DiscordUserIdInput = z.infer<typeof discordUserIdSchema>;
