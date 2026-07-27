import { eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  accessApplications,
  memberApplicationAccess,
  memberDiscordRoles,
  onboardingDefaultApplicationAccess,
  onboardingDefaultDiscordRoles,
} from "@/db/schema";
import { addKeycloakApplicationRole } from "@/lib/application-access-sync";

export type OnboardingDefaultApplication = {
  applicationId: string;
  keycloakClientId: string;
  keycloakRoleName: string;
};

export type OnboardingDefaultDiscordRole = {
  discordRoleId: string;
  discordRoleName: string;
};

export type OnboardingDefaultsRepository = {
  getOnboardingDefaults(): Promise<{
    applications: Array<OnboardingDefaultApplication>;
    discordRoles: Array<OnboardingDefaultDiscordRole>;
  }>;
  grantApplicationAccess(values: {
    applicationId: string;
    keycloakClientId: string;
    keycloakId: string;
    keycloakRoleName: string;
    memberId: string;
  }): Promise<void>;
  insertMemberDiscordRoles(
    memberId: string,
    roles: Array<OnboardingDefaultDiscordRole>,
  ): Promise<void>;
};

export type ApplyOnboardingDefaultsSummary = {
  applicationFailures: Array<string>;
  applicationsGranted: Array<string>;
  discordRolesGranted: Array<string>;
};

function createDefaultOnboardingDefaultsRepository(): OnboardingDefaultsRepository {
  return {
    async getOnboardingDefaults() {
      const [applications, discordRoles] = await Promise.all([
        db
          .select({
            applicationId: accessApplications.id,
            keycloakClientId: accessApplications.keycloakClientId,
            keycloakRoleName: accessApplications.keycloakRoleName,
          })
          .from(onboardingDefaultApplicationAccess)
          .innerJoin(
            accessApplications,
            eq(
              onboardingDefaultApplicationAccess.applicationId,
              accessApplications.id,
            ),
          )
          .where(isNull(accessApplications.archivedAt)),
        db
          .select({
            discordRoleId: onboardingDefaultDiscordRoles.discordRoleId,
            discordRoleName: onboardingDefaultDiscordRoles.discordRoleName,
          })
          .from(onboardingDefaultDiscordRoles),
      ]);

      return { applications, discordRoles };
    },
    async grantApplicationAccess(values) {
      await addKeycloakApplicationRole({
        application: {
          keycloakClientId: values.keycloakClientId,
          keycloakRoleName: values.keycloakRoleName,
        },
        keycloakId: values.keycloakId,
      });
      await db
        .insert(memberApplicationAccess)
        .values({
          applicationId: values.applicationId,
          memberId: values.memberId,
        })
        .onConflictDoNothing();
    },
    async insertMemberDiscordRoles(memberId, roles) {
      if (!roles.length) return;
      await db
        .insert(memberDiscordRoles)
        .values(
          roles.map((role) => ({
            discordRoleId: role.discordRoleId,
            discordRoleName: role.discordRoleName,
            memberId,
            source: "onboarding",
          })),
        )
        .onConflictDoNothing();
    },
  };
}

export async function applyOnboardingDefaults(values: {
  keycloakId: string;
  memberId: string;
  repository?: OnboardingDefaultsRepository;
}): Promise<ApplyOnboardingDefaultsSummary> {
  const repository =
    values.repository ?? createDefaultOnboardingDefaultsRepository();
  const defaults = await repository.getOnboardingDefaults();
  const summary: ApplyOnboardingDefaultsSummary = {
    applicationFailures: [],
    applicationsGranted: [],
    discordRolesGranted: defaults.discordRoles.map((role) => role.discordRoleId),
  };

  await repository.insertMemberDiscordRoles(values.memberId, defaults.discordRoles);

  for (const application of defaults.applications) {
    try {
      await repository.grantApplicationAccess({
        ...application,
        keycloakId: values.keycloakId,
        memberId: values.memberId,
      });
      summary.applicationsGranted.push(application.applicationId);
    } catch (error) {
      console.error("[onboarding-defaults]", {
        applicationId: application.applicationId,
        errorMessage: error instanceof Error ? error.message : String(error),
        memberId: values.memberId,
        message: "Unable to apply onboarding application default.",
      });
      summary.applicationFailures.push(application.applicationId);
    }
  }

  return summary;
}

export async function applyOnboardingDefaultsSafely(values: {
  keycloakId: string;
  memberId: string;
  repository?: OnboardingDefaultsRepository;
}) {
  try {
    return await applyOnboardingDefaults(values);
  } catch (error) {
    console.error("[onboarding-defaults]", {
      errorMessage: error instanceof Error ? error.message : String(error),
      memberId: values.memberId,
      message: "Unable to apply onboarding defaults.",
    });
    return {
      applicationFailures: [],
      applicationsGranted: [],
      discordRolesGranted: [],
    };
  }
}
