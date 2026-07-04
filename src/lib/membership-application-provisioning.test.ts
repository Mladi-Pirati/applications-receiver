import { describe, expect, test } from "bun:test";

import {
  generateMembershipApplicationUsernameBase,
  provisionMembershipApplicationMember,
  type MembershipApplicationProvisioningKeycloak,
  type MembershipApplicationProvisioningRepository,
} from "@/lib/membership-application-provisioning";
import type {
  MembershipApprovalEmailInput,
  MembershipApprovalEmailSender,
} from "@/lib/email/membership-approval";
import type { KeycloakUser } from "@/lib/keycloak/admin-client";

const application = {
  cityAndPostalCode: "1000 Ljubljana",
  dateOfBirth: "1998-04-12",
  discordUsername: "ana#1234",
  email: "ANA@example.TEST",
  firstName: "Ana Marija",
  fullLegalName: "Ana Marija Černe Šž",
  id: "application-1",
  lastName: "Černe Šž",
  phone: "+386 40 123 456",
  placeOfBirth: "Ljubljana",
  residenceRegion: "Osrednjeslovenska",
  streetAddress: "Piratska 1",
};

function createKeycloakDouble(
  options: {
    createUserId?: string;
    usersByEmail?: Record<string, KeycloakUser>;
    usersByUsername?: Record<string, KeycloakUser>;
  } = {},
) {
  const createdUsers: Array<{
    email: string;
    firstName: string;
    lastName: string;
    username: string;
  }> = [];
  const requiredActionsEmails: Array<{ actions: Array<string>; userId: string }> = [];

  const keycloak: MembershipApplicationProvisioningKeycloak = {
    async createUser(values) {
      createdUsers.push(values);
      return {
        email: values.email,
        enabled: true,
        emailVerified: false,
        firstName: values.firstName,
        fullName: `${values.firstName} ${values.lastName}`,
        id: options.createUserId ?? "created-keycloak-id",
        lastName: values.lastName,
        username: values.username,
      };
    },
    async findUserByEmail(email) {
      return options.usersByEmail?.[email.toLowerCase()] ?? null;
    },
    async findUserByUsername(username) {
      return options.usersByUsername?.[username] ?? null;
    },
    async sendRequiredActionsEmail(userId, actions) {
      requiredActionsEmails.push({ actions: [...actions], userId });
    },
  };

  return { createdUsers, keycloak, requiredActionsEmails };
}

function createRepositoryDouble() {
  const createdProfiles: Array<Parameters<
    MembershipApplicationProvisioningRepository["createFullMemberProfile"]
  >[0]> = [];

  const repository: MembershipApplicationProvisioningRepository = {
    async createFullMemberProfile(input) {
      createdProfiles.push(input);
      return { memberId: "member-1" };
    },
    async findLocalMemberProvisioningStateByKeycloakId() {
      return null;
    },
  };

  return { createdProfiles, repository };
}

function createApprovalEmailDouble(
  send: MembershipApprovalEmailSender["send"] = async () => true,
) {
  const approvalEmails: Array<MembershipApprovalEmailInput> = [];
  const approvalEmail: MembershipApprovalEmailSender = {
    async send(input) {
      approvalEmails.push(input);
      return send(input);
    },
  };

  return { approvalEmail, approvalEmails };
}

describe("membership application username generation", () => {
  test("normalizes names into a lowercase dot-separated username base", () => {
    expect(
      generateMembershipApplicationUsernameBase("Ana Marija", "Černe Šž"),
    ).toBe("ana.marija.cerne.sz");
  });

  test("falls back to applicant when the name has no username-safe characters", () => {
    expect(generateMembershipApplicationUsernameBase("!!!", "???")).toBe(
      "applicant",
    );
  });
});

describe("provisionMembershipApplicationMember", () => {
  test("creates a Keycloak user and full local member profile for a fresh application", async () => {
    const { createdUsers, keycloak, requiredActionsEmails } =
      createKeycloakDouble();
    const { createdProfiles, repository } = createRepositoryDouble();
    const { approvalEmail, approvalEmails } = createApprovalEmailDouble();
    const now = new Date("2026-05-29T10:15:00.000Z");

    await expect(
      provisionMembershipApplicationMember(application, {
        approvalEmail,
        keycloak,
        now: () => now,
        repository,
      }),
    ).resolves.toEqual({
      keycloakId: "created-keycloak-id",
      memberId: "member-1",
      status: "success",
    });

    expect(createdUsers).toEqual([
      {
        email: "ana@example.test",
        firstName: "Ana Marija",
        lastName: "Černe Šž",
        username: "ana.marija.cerne.sz",
      },
    ]);
    expect(createdProfiles).toEqual([
      {
        applicationId: "application-1",
        city: "Ljubljana",
        dateOfBirth: "1998-04-12",
        discordUsername: "ana#1234",
        email: "ana@example.test",
        firstName: "Ana Marija",
        fullLegalName: "Ana Marija Černe Šž",
        keycloakId: "created-keycloak-id",
        lastName: "Černe Šž",
        membershipStartedAt: now,
        phone: "+386 40 123 456",
        placeOfBirth: "Ljubljana",
        postalCode: "1000",
        residenceRegion: "Osrednjeslovenska",
        streetAddress: "Piratska 1",
        username: "ana.marija.cerne.sz",
      },
    ]);
    expect(requiredActionsEmails).toEqual([
      {
        actions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
        userId: "created-keycloak-id",
      },
    ]);
    expect(approvalEmails).toEqual([
      {
        applicationId: "application-1",
        email: "ana@example.test",
        firstName: "Ana Marija",
      },
    ]);
  });

  test("reuses an exact Keycloak email match instead of creating a duplicate user", async () => {
    const { createdUsers, keycloak, requiredActionsEmails } =
      createKeycloakDouble({
      usersByEmail: {
        "ana@example.test": {
          email: "ana@example.test",
          enabled: true,
          emailVerified: true,
          firstName: "Ana",
          fullName: "Ana Novak",
          id: "existing-keycloak-id",
          lastName: "Novak",
          username: "existing.ana",
        },
      },
    });
    const { createdProfiles, repository } = createRepositoryDouble();
    const { approvalEmail, approvalEmails } = createApprovalEmailDouble();

    await provisionMembershipApplicationMember(application, {
      approvalEmail,
      keycloak,
      repository,
    });

    expect(createdUsers).toEqual([]);
    expect(createdProfiles[0]).toMatchObject({
      keycloakId: "existing-keycloak-id",
      username: "existing.ana",
    });
    expect(requiredActionsEmails).toEqual([]);
    expect(approvalEmails).toEqual([
      {
        applicationId: "application-1",
        email: "ana@example.test",
        firstName: "Ana Marija",
      },
    ]);
  });

  test("sends setup actions for an existing Keycloak email match when email is unverified", async () => {
    const { keycloak, requiredActionsEmails } = createKeycloakDouble({
      usersByEmail: {
        "ana@example.test": {
          email: "ana@example.test",
          enabled: true,
          emailVerified: false,
          firstName: "Ana",
          fullName: "Ana Novak",
          id: "existing-keycloak-id",
          lastName: "Novak",
          username: "existing.ana",
        },
      },
    });
    const { repository } = createRepositoryDouble();
    const { approvalEmail, approvalEmails } = createApprovalEmailDouble();

    await provisionMembershipApplicationMember(application, {
      approvalEmail,
      keycloak,
      repository,
    });

    expect(requiredActionsEmails).toEqual([
      {
        actions: ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
        userId: "existing-keycloak-id",
      },
    ]);
    expect(approvalEmails).toEqual([
      {
        applicationId: "application-1",
        email: "ana@example.test",
        firstName: "Ana Marija",
      },
    ]);
  });

  test("increments the generated username until it is available", async () => {
    const { createdUsers, keycloak } = createKeycloakDouble({
      usersByUsername: {
        "ana.marija.cerne.sz": {
          email: "other@example.test",
          enabled: true,
          emailVerified: true,
          firstName: "Other",
          fullName: "Other Person",
          id: "other-1",
          lastName: "Person",
          username: "ana.marija.cerne.sz",
        },
        "ana.marija.cerne.sz1": {
          email: "someone@example.test",
          enabled: true,
          emailVerified: true,
          firstName: "Someone",
          fullName: "Someone Else",
          id: "other-2",
          lastName: "Else",
          username: "ana.marija.cerne.sz1",
        },
      },
    });
    const { repository } = createRepositoryDouble();
    const { approvalEmail } = createApprovalEmailDouble();

    await provisionMembershipApplicationMember(application, {
      approvalEmail,
      keycloak,
      repository,
    });

    expect(createdUsers[0]?.username).toBe("ana.marija.cerne.sz2");
  });

  test("treats an already fully provisioned local member as success", async () => {
    const { createdUsers, keycloak } = createKeycloakDouble({
      usersByEmail: {
        "ana@example.test": {
          email: "ana@example.test",
          enabled: true,
          emailVerified: true,
          firstName: "Ana",
          fullName: "Ana Novak",
          id: "existing-keycloak-id",
          lastName: "Novak",
          username: "existing.ana",
        },
      },
    });
    const { repository } = createRepositoryDouble();
    const { approvalEmail, approvalEmails } = createApprovalEmailDouble();
    repository.findLocalMemberProvisioningStateByKeycloakId = async () => ({
      hasAddress: true,
      hasMembership: true,
      hasPrimaryEmail: true,
      memberId: "existing-member-id",
    });

    await expect(
      provisionMembershipApplicationMember(application, {
        approvalEmail,
        keycloak,
        repository,
      }),
    ).resolves.toEqual({
      keycloakId: "existing-keycloak-id",
      memberId: "existing-member-id",
      status: "success",
    });
    expect(createdUsers).toEqual([]);
    expect(approvalEmails).toEqual([]);
  });

  test("does not reject when the approval email sender reports failure", async () => {
    const { keycloak } = createKeycloakDouble();
    const { repository } = createRepositoryDouble();
    const { approvalEmail, approvalEmails } = createApprovalEmailDouble(
      async () => false,
    );

    await expect(
      provisionMembershipApplicationMember(application, {
        approvalEmail,
        keycloak,
        repository,
      }),
    ).resolves.toEqual({
      keycloakId: "created-keycloak-id",
      memberId: "member-1",
      status: "success",
    });
    expect(approvalEmails).toHaveLength(1);
  });

  test("does not reject when the approval email request fails", async () => {
    const { keycloak } = createKeycloakDouble();
    const { repository } = createRepositoryDouble();
    const { approvalEmail, approvalEmails } = createApprovalEmailDouble(
      async () => {
        throw new Error("Network unavailable");
      },
    );

    await expect(
      provisionMembershipApplicationMember(application, {
        approvalEmail,
        keycloak,
        repository,
      }),
    ).resolves.toEqual({
      keycloakId: "created-keycloak-id",
      memberId: "member-1",
      status: "success",
    });
    expect(approvalEmails).toHaveLength(1);
  });

  test("fails safely when a local member exists without the full generated profile", async () => {
    const { keycloak } = createKeycloakDouble({
      usersByEmail: {
        "ana@example.test": {
          email: "ana@example.test",
          enabled: true,
          emailVerified: true,
          firstName: "Ana",
          fullName: "Ana Novak",
          id: "existing-keycloak-id",
          lastName: "Novak",
          username: "existing.ana",
        },
      },
    });
    const { repository } = createRepositoryDouble();
    repository.findLocalMemberProvisioningStateByKeycloakId = async () => ({
      hasAddress: false,
      hasMembership: true,
      hasPrimaryEmail: true,
      memberId: "existing-member-id",
    });

    await expect(
      provisionMembershipApplicationMember(application, {
        keycloak,
        repository,
      }),
    ).rejects.toThrow("already exists without the full generated profile");
  });
});
