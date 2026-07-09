import { z } from "zod";

export const groupInputSchema = z.object({
  description: z.string().trim().max(500).optional(),
  name: z.string().trim().min(1, "Group name is required.").max(120),
});

export const groupRoleIdsSchema = z.object({
  roleIds: z.array(z.string().trim().min(1)).default([]),
});

export const groupApplicationIdsSchema = z.object({
  applicationIds: z.array(z.string().trim().min(1)).default([]),
});

export const groupDiscordRolesSchema = z.object({
  discordRoles: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1),
      }),
    )
    .default([]),
});

export const memberGroupAssignmentSchema = z.object({
  assigned: z.boolean(),
  groupId: z.string().trim().min(1, "Group id is required."),
});

export type GroupInput = z.infer<typeof groupInputSchema>;
