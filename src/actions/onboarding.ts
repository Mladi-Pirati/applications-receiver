"use server";

import { revalidatePath } from "next/cache";
import { and, inArray, isNull } from "drizzle-orm";

import {
  accessApplications,
  onboardingDefaultApplicationAccess,
  onboardingDefaultDiscordRoles,
} from "@/db/schema";
import {
  db,
  hasAnyPermission,
  hasPermission,
} from "@/lib/onboarding-action-dependencies";
import {
  updateOnboardingDefaultsSchema,
  type UpdateOnboardingDefaultsInput,
} from "@/lib/validation/onboarding";
import type { DiscordGuildRole } from "@/lib/discord/bot-client";
import { listCachedDiscordGuildRoles } from "@/lib/discord/guild-roles";

type ActionSuccess = { ok: true; message?: string };
type ActionFailure<TField extends string = string> = {
  ok: false;
  fieldErrors?: Partial<Record<TField, string>>;
  message: string;
};
type ActionResult<T = ActionSuccess, TField extends string = string> =
  | T
  | ActionFailure<TField>;

async function requireOnboardingPermission() {
  const allowed = await hasPermission("members.manage_onboarding");
  if (!allowed) {
    return {
      ok: false as const,
      message: "You are not allowed to manage onboarding defaults.",
    };
  }
  return { ok: true as const };
}

export async function updateOnboardingDefaultsAction(
  values: UpdateOnboardingDefaultsInput,
): Promise<ActionResult> {
  const access = await requireOnboardingPermission();
  if (!access.ok) return access;

  const parsed = updateOnboardingDefaultsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Please choose valid onboarding defaults." };
  }

  const applicationIds = [...new Set(parsed.data.applicationIds)];
  if (applicationIds.length) {
    const activeApplications = await db
      .select({ id: accessApplications.id })
      .from(accessApplications)
      .where(
        and(
          inArray(accessApplications.id, applicationIds),
          isNull(accessApplications.archivedAt),
        ),
      );
    if (activeApplications.length !== applicationIds.length) {
      return {
        ok: false,
        message: "One or more selected applications are not active.",
      };
    }
  }

  const discordRoles = [
    ...new Map(
      parsed.data.discordRoles.map((role) => [
        role.id,
        { discordRoleId: role.id, discordRoleName: role.name },
      ]),
    ).values(),
  ];

  await db.transaction(async (tx) => {
    await tx.delete(onboardingDefaultApplicationAccess);
    await tx.delete(onboardingDefaultDiscordRoles);

    if (applicationIds.length) {
      await tx.insert(onboardingDefaultApplicationAccess).values(
        applicationIds.map((applicationId) => ({ applicationId })),
      );
    }

    if (discordRoles.length) {
      await tx.insert(onboardingDefaultDiscordRoles).values(discordRoles);
    }
  });

  revalidatePath("/admin/members/onboarding");
  return { ok: true, message: "Onboarding defaults saved." };
}

export async function listDiscordGuildRolesAction(): Promise<
  ActionResult<{
    ok: true;
    roles: Array<DiscordGuildRole>;
  }>
> {
  const allowed = await hasAnyPermission(
    "members.manage_onboarding",
    "access-control.manage_groups",
  );
  if (!allowed) {
    return {
      ok: false,
      message: "You are not allowed to list Discord roles.",
    };
  }

  try {
    return {
      ok: true,
      roles: await listCachedDiscordGuildRoles(),
    };
  } catch {
    return {
      ok: false,
      message: "Unable to load Discord roles right now.",
    };
  }
}
