import { eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { memberRoles, members, roles } from "@/db/schema";
import {
  getKeycloakUsernameFromProfile,
  keycloakAccessTokenHasClientRole,
  keycloakProfileHasClientRole,
} from "@/lib/auth/keycloak-access";
import { db } from "@/lib/auth/sign-in-gate-dependencies";

const keycloakProfileSchema = z.looseObject({
  sub: z.string().min(1),
});

export function getKeycloakProfileSub(profile: unknown) {
  const parsed = keycloakProfileSchema.safeParse(profile);

  return parsed.success ? parsed.data.sub : null;
}

function getNamePartsFromProfile(profile: unknown): {
  firstName: string;
  lastName: string;
} {
  const parsed = z
    .looseObject({
      given_name: z.string().optional(),
      family_name: z.string().optional(),
      name: z.string().optional(),
    })
    .safeParse(profile);

  if (!parsed.success) {
    return { firstName: "", lastName: "" };
  }

  const givenName = parsed.data.given_name?.trim();
  const familyName = parsed.data.family_name?.trim();

  if (givenName && familyName) {
    return { firstName: givenName, lastName: familyName };
  }

  const fullName = parsed.data.name?.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/);
    return {
      firstName: givenName || parts[0] || "",
      lastName: familyName || parts.slice(1).join(" ") || "",
    };
  }

  return {
    firstName: givenName || "",
    lastName: familyName || "",
  };
}

export async function getSessionMemberByKeycloakUserId(keycloakUserId: string) {
  return db.query.members.findFirst({
    where: eq(members.keycloakId, keycloakUserId),
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      keycloakId: true,
      username: true,
      disabledAt: true,
    },
  });
}

async function hasKeycloakManagedMembers() {
  const rows = await db
    .select({
      id: members.id,
    })
    .from(members)
    .where(isNotNull(members.keycloakId))
    .limit(1);

  return rows.length > 0;
}

function hasClientRole(profile: unknown, accessToken: unknown) {
  return (
    keycloakProfileHasClientRole(profile, process.env.KEYCLOAK_CLIENT_ID ?? "") ||
    keycloakAccessTokenHasClientRole(
      accessToken,
      process.env.KEYCLOAK_CLIENT_ID ?? "",
    )
  );
}

async function assignSuperadminRole(memberId: string) {
  const superadminRole = await db.query.roles.findFirst({
    where: eq(roles.key, "superadmin"),
  });

  if (!superadminRole) {
    return;
  }

  await db.insert(memberRoles).values({
    memberId,
    roleId: superadminRole.id,
    grantedBy: null,
  });
}

export async function ensureLocalUserForSignIn(
  profile: unknown,
  accessToken: unknown,
) {
  const sub = getKeycloakProfileSub(profile);

  if (!sub) {
    return false;
  }

  const existingMember = await getSessionMemberByKeycloakUserId(sub);

  if (existingMember) {
    return existingMember.disabledAt === null;
  }

  // Bootstrap and username-linking below only run against a fresh database;
  // they still require an explicit helm client role in Keycloak so an
  // arbitrary realm user can never become the initial superadmin.
  if (!hasClientRole(profile, accessToken)) {
    return false;
  }

  if (await hasKeycloakManagedMembers()) {
    return false;
  }

  const username = getKeycloakUsernameFromProfile(profile) ?? sub;
  const { firstName, lastName } = getNamePartsFromProfile(profile);
  const existingUsernameMember = await db.query.members.findFirst({
    where: eq(members.username, username),
    columns: {
      id: true,
    },
  });

  if (existingUsernameMember) {
    await db
      .update(members)
      .set({
        firstName: firstName || username,
        fullLegalName: [firstName || username, lastName].filter(Boolean).join(" "),
        lastName: lastName || "",
        keycloakId: sub,
        username,
      })
      .where(eq(members.id, existingUsernameMember.id));

    await assignSuperadminRole(existingUsernameMember.id);

    return true;
  }

  const [newMember] = await db
    .insert(members)
    .values({
      firstName: firstName || username,
      fullLegalName: [firstName || username, lastName].filter(Boolean).join(" "),
      lastName: lastName || "",
      keycloakId: sub,
      username,
    })
    .returning({ id: members.id });

  if (newMember) {
    await assignSuperadminRole(newMember.id);
  }

  return true;
}
