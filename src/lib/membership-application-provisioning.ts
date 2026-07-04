import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  addresses,
  contacts,
  members,
  memberships,
} from "@/db/schema";
import {
  createKeycloakAdminClient,
  type KeycloakRequiredAction,
  type KeycloakUser,
  type KeycloakUserCreate,
} from "@/lib/keycloak/admin-client";
import {
  sendMembershipApprovalEmail,
  type MembershipApprovalEmailSender,
} from "@/lib/email/membership-approval";

const REQUIRED_KEYCLOAK_ACTIONS: Array<KeycloakRequiredAction> = [
  "VERIFY_EMAIL",
  "UPDATE_PASSWORD",
];

export type MemberCreationStatus = "success" | "fail";

export type MembershipApplicationProvisioningApplication = {
  cityAndPostalCode: string;
  dateOfBirth: string;
  discordUsername: string | null;
  email: string;
  firstName: string;
  fullLegalName: string;
  id: string;
  lastName: string;
  phone: string | null;
  placeOfBirth: string;
  residenceRegion: string;
  streetAddress: string;
};

export type MembershipApplicationProvisioningKeycloak = {
  createUser(values: KeycloakUserCreate): Promise<KeycloakUser>;
  findUserByEmail(email: string): Promise<KeycloakUser | null>;
  findUserByUsername(username: string): Promise<KeycloakUser | null>;
  sendRequiredActionsEmail(
    userId: string,
    actions: Array<KeycloakRequiredAction>,
  ): Promise<void>;
};

export type FullMemberProfileInput = {
  applicationId: string;
  city: string;
  dateOfBirth: string;
  discordUsername: string | null;
  email: string;
  firstName: string;
  fullLegalName: string;
  keycloakId: string;
  lastName: string;
  membershipStartedAt: Date;
  phone: string | null;
  placeOfBirth: string;
  postalCode: string;
  residenceRegion: string;
  streetAddress: string;
  username: string;
};

export type LocalMemberProvisioningState = {
  hasAddress: boolean;
  hasMembership: boolean;
  hasPrimaryEmail: boolean;
  memberId: string;
};

export type MembershipApplicationProvisioningRepository = {
  createFullMemberProfile(
    input: FullMemberProfileInput,
  ): Promise<{ memberId: string }>;
  findLocalMemberProvisioningStateByKeycloakId(
    keycloakId: string,
  ): Promise<LocalMemberProvisioningState | null>;
};

export type MembershipApplicationProvisioningDependencies = {
  approvalEmail?: MembershipApprovalEmailSender;
  keycloak?: MembershipApplicationProvisioningKeycloak;
  now?: () => Date;
  repository?: MembershipApplicationProvisioningRepository;
};

export function generateMembershipApplicationUsernameBase(
  firstName: string,
  lastName: string,
) {
  const normalized = `${firstName} ${lastName}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");

  return normalized || "applicant";
}

export async function provisionMembershipApplicationMember(
  application: MembershipApplicationProvisioningApplication,
  dependencies: MembershipApplicationProvisioningDependencies = {},
) {
  const keycloak = dependencies.keycloak ?? createKeycloakAdminClient();
  const repository =
    dependencies.repository ?? createMembershipApplicationProvisioningRepository();
  const approvalEmail = dependencies.approvalEmail ?? {
    send: sendMembershipApprovalEmail,
  };
  const now = dependencies.now ?? (() => new Date());
  const email = application.email.trim().toLowerCase();
  const existingKeycloakUser = await keycloak.findUserByEmail(email);
  const keycloakUser =
    existingKeycloakUser ??
    (await keycloak.createUser({
      email,
      firstName: application.firstName,
      lastName: application.lastName,
      username: await resolveAvailableUsername(application, keycloak),
    }));
  const shouldSendRequiredActions =
    !existingKeycloakUser || !existingKeycloakUser.emailVerified;

  const existingLocalMember =
    await repository.findLocalMemberProvisioningStateByKeycloakId(
      keycloakUser.id,
    );

  if (existingLocalMember) {
    if (isFullyProvisioned(existingLocalMember)) {
      if (shouldSendRequiredActions) {
        await keycloak.sendRequiredActionsEmail(
          keycloakUser.id,
          REQUIRED_KEYCLOAK_ACTIONS,
        );
      }
      return {
        keycloakId: keycloakUser.id,
        memberId: existingLocalMember.memberId,
        status: "success" as const,
      };
    }

    throw new Error(
      "Local member already exists without the full generated profile.",
    );
  }

  const address = parseCityAndPostalCode(application.cityAndPostalCode);
  const member = await repository.createFullMemberProfile({
    applicationId: application.id,
    city: address.city,
    dateOfBirth: application.dateOfBirth,
    discordUsername: application.discordUsername?.trim() || null,
    email,
    firstName: application.firstName,
    fullLegalName: application.fullLegalName,
    keycloakId: keycloakUser.id,
    lastName: application.lastName,
    membershipStartedAt: now(),
    phone: application.phone?.trim() || null,
    placeOfBirth: application.placeOfBirth,
    postalCode: address.postalCode,
    residenceRegion: application.residenceRegion,
    streetAddress: application.streetAddress,
    username: keycloakUser.username,
  });

  if (shouldSendRequiredActions) {
    await keycloak.sendRequiredActionsEmail(
      keycloakUser.id,
      REQUIRED_KEYCLOAK_ACTIONS,
    );
  }

  await sendApprovalEmailSafely(approvalEmail, {
    applicationId: application.id,
    email,
    firstName: application.firstName,
  });

  return {
    keycloakId: keycloakUser.id,
    memberId: member.memberId,
    status: "success" as const,
  };
}

async function sendApprovalEmailSafely(
  approvalEmail: MembershipApprovalEmailSender,
  input: Parameters<MembershipApprovalEmailSender["send"]>[0],
) {
  try {
    await approvalEmail.send(input);
  } catch (error) {
    console.error("[membership-approval-email]", {
      applicationId: input.applicationId,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : String(error),
    });
  }
}

async function resolveAvailableUsername(
  application: MembershipApplicationProvisioningApplication,
  keycloak: MembershipApplicationProvisioningKeycloak,
) {
  const baseUsername = generateMembershipApplicationUsernameBase(
    application.firstName,
    application.lastName,
  );

  for (let index = 0; index < 1000; index += 1) {
    const username = index === 0 ? baseUsername : `${baseUsername}${index}`;
    const existingUser = await keycloak.findUserByUsername(username);

    if (!existingUser) {
      return username;
    }
  }

  throw new Error("Unable to find an available Keycloak username.");
}

function parseCityAndPostalCode(value: string) {
  const trimmed = value.trim();
  const postalFirst = trimmed.match(/^(\d{4,5})\s+(.+)$/);
  if (postalFirst) {
    return {
      city: postalFirst[2].trim(),
      postalCode: postalFirst[1],
    };
  }

  const postalLast = trimmed.match(/^(.+?)[,\s]+(\d{4,5})$/);
  if (postalLast) {
    return {
      city: postalLast[1].trim(),
      postalCode: postalLast[2],
    };
  }

  return {
    city: trimmed,
    postalCode: "",
  };
}

function isFullyProvisioned(state: LocalMemberProvisioningState) {
  return state.hasAddress && state.hasMembership && state.hasPrimaryEmail;
}

function createMembershipApplicationProvisioningRepository(): MembershipApplicationProvisioningRepository {
  return {
    async createFullMemberProfile(input) {
      const [createdMember] = await db.transaction(async (tx) => {
        const createdMembers = await tx
          .insert(members)
          .values({
            applicationId: input.applicationId,
            dateOfBirth: input.dateOfBirth,
            firstName: input.firstName,
            fullLegalName: input.fullLegalName,
            keycloakId: input.keycloakId,
            lastName: input.lastName,
            notes: `Created from membership application ${input.applicationId}.`,
            placeOfBirth: input.placeOfBirth,
            residenceRegion: input.residenceRegion,
            username: input.username,
          })
          .returning({ id: members.id });

        const member = createdMembers[0];
        if (!member) return [];

        await tx.insert(contacts).values([
          {
            isPrimary: true,
            label: "Primary",
            memberId: member.id,
            sortOrder: 0,
            type: "email",
            value: input.email,
          },
          ...(input.phone
            ? [
                {
                  isPrimary: true,
                  label: "Primary",
                  memberId: member.id,
                  sortOrder: 1,
                  type: "phone" as const,
                  value: input.phone,
                },
              ]
            : []),
          ...(input.discordUsername
            ? [
                {
                  isPrimary: false,
                  label: "Discord",
                  memberId: member.id,
                  sortOrder: input.phone ? 2 : 1,
                  type: "discord" as const,
                  value: input.discordUsername,
                },
              ]
            : []),
        ]);

        await tx.insert(addresses).values({
          city: input.city,
          country: "Slovenija",
          label: "primary",
          memberId: member.id,
          postalCode: input.postalCode,
          street: input.streetAddress,
        });

        await tx.insert(memberships).values({
          endedAt: null,
          expiresAt: null,
          extendedAt: input.membershipStartedAt,
          memberId: member.id,
        });

        return createdMembers;
      });

      if (!createdMember) {
        throw new Error("Unable to create local member profile.");
      }

      return { memberId: createdMember.id };
    },
    async findLocalMemberProvisioningStateByKeycloakId(keycloakId) {
      const member = await db.query.members.findFirst({
        columns: { id: true },
        where: eq(members.keycloakId, keycloakId),
      });

      if (!member) return null;

      const [primaryEmail, address, membership] = await Promise.all([
        db.query.contacts.findFirst({
          columns: { id: true },
          where: and(
            eq(contacts.memberId, member.id),
            eq(contacts.type, "email"),
            eq(contacts.isPrimary, true),
          ),
        }),
        db.query.addresses.findFirst({
          columns: { id: true },
          where: eq(addresses.memberId, member.id),
        }),
        db.query.memberships.findFirst({
          columns: { id: true },
          where: and(
            eq(memberships.memberId, member.id),
            isNull(memberships.endedAt),
          ),
        }),
      ]);

      return {
        hasAddress: Boolean(address),
        hasMembership: Boolean(membership),
        hasPrimaryEmail: Boolean(primaryEmail),
        memberId: member.id,
      };
    },
  };
}
