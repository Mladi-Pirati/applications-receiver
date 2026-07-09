import { z } from "zod";

export const discordRoleSnapshotSchema = z.object({
  id: z.string().trim().min(1, "Discord role id is required."),
  name: z.string().trim().min(1, "Discord role name is required."),
});

export const updateOnboardingDefaultsSchema = z.object({
  applicationIds: z.array(z.string().trim().min(1)).default([]),
  discordRoles: z.array(discordRoleSnapshotSchema).default([]),
});

export type UpdateOnboardingDefaultsInput = z.infer<
  typeof updateOnboardingDefaultsSchema
>;
