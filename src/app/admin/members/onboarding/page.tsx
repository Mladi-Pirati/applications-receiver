import { asc, isNull } from "drizzle-orm";

import { OnboardingDefaultsManagement } from "@/components/admin/members/onboarding-defaults-management";
import { db } from "@/db";
import {
  accessApplications,
  onboardingDefaultApplicationAccess,
  onboardingDefaultDiscordRoles,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/permissions";
import { listCachedDiscordGuildRoles } from "@/lib/discord/guild-roles";

export default async function MembersOnboardingPage() {
  await requirePermission("members.manage_onboarding");

  const [applications, defaultApplications, defaultDiscordRoles, discordRoles] =
    await Promise.all([
      db
        .select({ id: accessApplications.id, name: accessApplications.name })
        .from(accessApplications)
        .where(isNull(accessApplications.archivedAt))
        .orderBy(asc(accessApplications.name)),
      db
        .select({
          applicationId: onboardingDefaultApplicationAccess.applicationId,
        })
        .from(onboardingDefaultApplicationAccess),
      db
        .select({
          id: onboardingDefaultDiscordRoles.discordRoleId,
          name: onboardingDefaultDiscordRoles.discordRoleName,
        })
        .from(onboardingDefaultDiscordRoles)
        .orderBy(asc(onboardingDefaultDiscordRoles.discordRoleName)),
      listCachedDiscordGuildRoles()
        .then((roles) => ({ message: null, roles }))
        .catch(() => ({
          message: "Unable to load Discord roles right now.",
          roles: [],
        })),
    ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Onboarding</h1>
        <p className="text-xs text-muted-foreground">
          Defaults apply only to members approved after the change is saved.
        </p>
      </div>
      <OnboardingDefaultsManagement
        applicationOptions={applications}
        defaultApplicationIds={defaultApplications.map((row) => row.applicationId)}
        defaultDiscordRoles={defaultDiscordRoles}
        discordRoleLoadMessage={discordRoles.message}
        discordRoleOptions={discordRoles.roles}
      />
    </div>
  );
}
