import { describe, expect, test } from "bun:test";

import {
  applyOnboardingDefaults,
  type OnboardingDefaultsRepository,
} from "@/lib/onboarding-defaults";

function createRepository(options: {
  applicationDefaults?: Array<{
    applicationId: string;
    keycloakClientId: string;
    keycloakRoleName: string;
  }>;
  discordDefaults?: Array<{ discordRoleId: string; discordRoleName: string }>;
  failApplicationId?: string;
}) {
  const grantedApplications: Array<string> = [];
  const insertedApplications: Array<string> = [];
  const insertedDiscordRoles: Array<string> = [];

  const repository: OnboardingDefaultsRepository = {
    async getOnboardingDefaults() {
      return {
        applications: options.applicationDefaults ?? [],
        discordRoles: options.discordDefaults ?? [],
      };
    },
    async grantApplicationAccess(values) {
      grantedApplications.push(values.applicationId);
      if (values.applicationId === options.failApplicationId) {
        throw new Error("Keycloak unavailable");
      }
      insertedApplications.push(values.applicationId);
    },
    async insertMemberDiscordRoles(_memberId, roles) {
      insertedDiscordRoles.push(...roles.map((role) => role.discordRoleId));
    },
  };

  return {
    grantedApplications,
    insertedApplications,
    insertedDiscordRoles,
    repository,
  };
}

describe("applyOnboardingDefaults", () => {
  test("snapshots default Discord roles and grants default applications", async () => {
    const {
      grantedApplications,
      insertedApplications,
      insertedDiscordRoles,
      repository,
    } = createRepository({
      applicationDefaults: [
        {
          applicationId: "app-1",
          keycloakClientId: "wiki",
          keycloakRoleName: "user",
        },
      ],
      discordDefaults: [{ discordRoleId: "role-1", discordRoleName: "Member" }],
    });

    await applyOnboardingDefaults({
      keycloakId: "keycloak-1",
      memberId: "member-1",
      repository,
    });

    expect(grantedApplications).toEqual(["app-1"]);
    expect(insertedApplications).toEqual(["app-1"]);
    expect(insertedDiscordRoles).toEqual(["role-1"]);
  });

  test("continues applying later defaults when one application grant fails", async () => {
    const { insertedApplications, insertedDiscordRoles, repository } =
      createRepository({
        applicationDefaults: [
          {
            applicationId: "app-1",
            keycloakClientId: "wiki",
            keycloakRoleName: "user",
          },
          {
            applicationId: "app-2",
            keycloakClientId: "forum",
            keycloakRoleName: "member",
          },
        ],
        discordDefaults: [{ discordRoleId: "role-1", discordRoleName: "Member" }],
        failApplicationId: "app-1",
      });

    await expect(
      applyOnboardingDefaults({
        keycloakId: "keycloak-1",
        memberId: "member-1",
        repository,
      }),
    ).resolves.toEqual({
      applicationFailures: ["app-1"],
      applicationsGranted: ["app-2"],
      discordRolesGranted: ["role-1"],
    });
    expect(insertedApplications).toEqual(["app-2"]);
    expect(insertedDiscordRoles).toEqual(["role-1"]);
  });
});
