"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";

import {
  addresses,
  contacts,
  memberRoles,
  members,
  memberships,
  roles,
  type ContactType,
} from "@/db/schema";
import {
  createMembersKeycloakAdminClient,
  db,
  getCurrentUser,
  getCurrentUserHighestRoleRank,
  getHighestRoleRank,
  hasPermission,
  memberHasActiveRole,
  roleGrantsAnyPermission,
  sendMembershipWelcomeEmail,
  syncMemberApplicationRoles,
} from "@/lib/members-action-dependencies";
import { ensurePrimaryEmail, type DbExecutor } from "@/lib/member-contacts";
import {
  addressInputSchema,
  contactInputSchema,
  createMemberSchema,
  memberProfileSchema,
  membershipRenewalSchema,
  reorderContactsSchema,
  roleAssignmentSchema,
  type AddressInput,
  type ContactInput,
  type CreateMemberInput,
  type MemberProfileInput,
  type MembershipRenewalInput,
  type RoleAssignmentInput,
} from "@/lib/validation/members";

type ActionSuccess = { ok: true; message?: string };
type ActionFailure<TField extends string = string> = {
  ok: false;
  fieldErrors?: Partial<Record<TField, string>>;
  message: string;
};

type ActionResult<T = ActionSuccess, TField extends string = string> =
  | T
  | ActionFailure<TField>;

const CRITICAL_SELF_PERMISSIONS = [
  "members.role_management",
  "access-control.manage_roles",
];

const searchKeycloakUsersSchema = z.object({
  q: z.string().trim().min(1).max(120),
});

const roleAssignmentsSchema = z.object({
  assignments: z.array(roleAssignmentSchema),
});

const roleAssignmentToggleSchema = roleAssignmentSchema.extend({
  assigned: z.boolean(),
});

const deleteMemberSchema = z.object({
  mode: z.enum(["local", "local-and-keycloak", "local-and-revoke-helm"]),
});

const resendWelcomeEmailSchema = z.object({
  memberId: z.string().trim().min(1, "Member id is required."),
});

export type DeleteMemberMode = z.infer<typeof deleteMemberSchema>["mode"];

type MembersSyncLogDetails = Record<
  string,
  boolean | number | string | null | undefined
>;

function getErrorLogDetails(error: unknown): MembersSyncLogDetails {
  if (typeof error !== "object" || error === null) {
    return { error: String(error) };
  }

  const details: MembersSyncLogDetails = {};
  if ("name" in error && typeof error.name === "string") {
    details.errorName = error.name;
  }
  if ("message" in error && typeof error.message === "string") {
    details.errorMessage = error.message;
  }
  if ("code" in error && typeof error.code === "string") {
    details.errorCode = error.code;
  }
  if ("status" in error && typeof error.status === "number") {
    details.errorStatus = error.status;
  }
  if (
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    details.responseStatus = error.response.status;
  }
  if (
    "config" in error &&
    typeof error.config === "object" &&
    error.config !== null
  ) {
    if ("method" in error.config && typeof error.config.method === "string") {
      details.requestMethod = error.config.method.toUpperCase();
    }
    if ("url" in error.config && typeof error.config.url === "string") {
      details.requestPath = getLoggableUrlPath(error.config.url);
    }
  }
  if (
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response
  ) {
    details.responseBody = getLoggableResponseBody(error.response.data);
  }

  return details;
}

function getLoggableUrlPath(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function getLoggableResponseBody(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, 500);

  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function getErrorResponseStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  if (
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return error.response.status;
  }

  return null;
}

function logMembersSyncEvent(
  level: "info" | "warn" | "error",
  message: string,
  details: MembersSyncLogDetails = {},
) {
  console[level]("[members-sync]", {
    message,
    ...details,
  });
}

function isUniqueViolation(error: unknown) {
  let currentError: unknown = error;
  while (typeof currentError === "object" && currentError !== null) {
    if ("code" in currentError && currentError.code === "23505") return true;
    if (!("cause" in currentError)) return false;
    currentError = currentError.cause;
  }
  return false;
}

async function requireMembersPermission(permissionKey: string) {
  const allowed = await hasPermission(permissionKey);
  if (!allowed) {
    return {
      ok: false as const,
      message: "You are not allowed to manage members.",
    };
  }
  return { ok: true as const };
}

async function getCurrentMemberId() {
  const user = await getCurrentUser();
  if (!user) return null;

  const member = await db.query.members.findFirst({
    columns: { id: true },
    where: eq(members.keycloakId, user.keycloakUserId),
  });

  return member?.id ?? null;
}

async function getMemberIdentity(memberId: string) {
  return db.query.members.findFirst({
    columns: {
      disabledAt: true,
      firstName: true,
      id: true,
      keycloakId: true,
      lastName: true,
      username: true,
    },
    where: eq(members.id, memberId),
  });
}

async function getKeycloakUserForMemberSync(member: {
  id: string;
  keycloakId: string;
  username: string;
}) {
  const keycloak = createMembersKeycloakAdminClient();

  try {
    logMembersSyncEvent("info", "Fetching Keycloak user by stored id.", {
      keycloakId: member.keycloakId,
      memberId: member.id,
    });

    return {
      keycloakUser: await keycloak.getUser(member.keycloakId),
      resolvedKeycloakId: member.keycloakId,
    };
  } catch (error) {
    if (getErrorResponseStatus(error) !== 404) throw error;

    logMembersSyncEvent("warn", "Stored Keycloak id was not found.", {
      keycloakId: member.keycloakId,
      memberId: member.id,
      username: member.username,
    });
  }

  logMembersSyncEvent("info", "Searching Keycloak user by local username.", {
    memberId: member.id,
    username: member.username,
  });

  const users = await keycloak.searchUsersByUsername(member.username);
  const matchingUsers = users.filter(
    (user) => user.username === member.username,
  );

  if (matchingUsers.length !== 1) {
    logMembersSyncEvent(
      "error",
      "Keycloak username fallback did not resolve exactly one user.",
      {
        matchCount: matchingUsers.length,
        memberId: member.id,
        username: member.username,
      },
    );
    throw new Error(
      `Keycloak user not found by id and username fallback matched ${matchingUsers.length} users.`,
    );
  }

  const [keycloakUser] = matchingUsers;
  await db
    .update(members)
    .set({ keycloakId: keycloakUser.id })
    .where(eq(members.id, member.id));

  logMembersSyncEvent(
    "info",
    "Relinked member to Keycloak user found by username.",
    {
      keycloakId: keycloakUser.id,
      memberId: member.id,
      previousKeycloakId: member.keycloakId,
      username: member.username,
    },
  );

  return {
    keycloakUser,
    resolvedKeycloakId: keycloakUser.id,
  };
}

async function syncKeycloakClientAccess(values: {
  disabled: boolean;
  hasActiveRole: boolean;
  keycloakId: string;
}) {
  const keycloak = createMembersKeycloakAdminClient();

  if (values.disabled || !values.hasActiveRole) {
    await keycloak.removeAllClientRoles(values.keycloakId);
    return;
  }

  await keycloak.ensureDefaultClientRole(values.keycloakId);
}

async function syncPrimaryEmailFromKeycloak(
  memberId: string,
  email: string | null,
  tx: DbExecutor = db,
) {
  if (email) {
    await ensurePrimaryEmail(memberId, email, tx);
    return;
  }

  await tx
    .update(contacts)
    .set({ isPrimary: false })
    .where(and(eq(contacts.memberId, memberId), eq(contacts.type, "email")));
}

function revalidateMembers(memberId?: string) {
  revalidatePath("/admin/members");
  if (memberId) revalidatePath(`/admin/members/${memberId}`);
}

async function requireHighestRankedRoleForWelcomeEmail() {
  const [currentRank, highestRank] = await Promise.all([
    getCurrentUserHighestRoleRank(),
    getHighestRoleRank(),
  ]);

  if (
    currentRank === null ||
    highestRank === null ||
    currentRank !== highestRank
  ) {
    return {
      ok: false as const,
      message:
        "Only members with the highest-ranked role can resend welcome emails.",
    };
  }

  return { ok: true as const };
}

function getMemberDisplayName(member: {
  firstName: string;
  lastName: string;
  username?: string;
}) {
  return (
    `${member.firstName} ${member.lastName}`.trim() ||
    member.username ||
    "member"
  );
}

export async function resendWelcomeEmailAction(
  memberId: string,
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const rankAccess = await requireHighestRankedRoleForWelcomeEmail();
  if (!rankAccess.ok) return rankAccess;

  const parsed = resendWelcomeEmailSchema.safeParse({ memberId });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Member id is required.",
    };
  }

  const rows = await db
    .select({
      email: contacts.value,
      firstName: members.firstName,
      id: members.id,
      lastName: members.lastName,
      username: members.username,
    })
    .from(members)
    .leftJoin(
      contacts,
      and(
        eq(contacts.memberId, members.id),
        eq(contacts.type, "email"),
        eq(contacts.isPrimary, true),
      ),
    )
    .where(eq(members.id, parsed.data.memberId))
    .orderBy(asc(members.id));
  const member = rows[0];

  if (!member) {
    return { ok: false, message: "That member could not be found." };
  }

  const email = member.email?.trim();
  if (!email) {
    return {
      ok: false,
      message: "That member does not have a primary email address.",
    };
  }

  const sent = await sendMembershipWelcomeEmail({
    email,
    firstName: member.firstName,
    idempotencyKey: `membership-welcome-resend/${member.id}/${crypto.randomUUID()}`,
    memberId: member.id,
  });

  if (!sent) {
    return {
      ok: false,
      message: "Unable to resend the welcome email right now.",
    };
  }

  revalidateMembers(member.id);
  return {
    ok: true,
    message: `Welcome email resent to ${getMemberDisplayName(member)}.`,
  };
}

export async function searchKeycloakUsersAction(query: string): Promise<
  ActionResult<{
    ok: true;
    users: Array<{
      email: string | null;
      enabled: boolean;
      firstName: string | null;
      fullName: string;
      id: string;
      lastName: string | null;
      username: string;
    }>;
  }>
> {
  const access = await requireMembersPermission("members.create");
  if (!access.ok) return access;

  const parsed = searchKeycloakUsersSchema.safeParse({ q: query });
  if (!parsed.success) return { ok: true, users: [] };

  try {
    const users = await createMembersKeycloakAdminClient().searchUsers(
      parsed.data.q,
    );
    return { ok: true, users };
  } catch {
    return {
      ok: false,
      message: "Unable to search Keycloak users right now.",
    };
  }
}

export async function createMemberAction(
  values: CreateMemberInput,
): Promise<
  ActionResult<ActionSuccess & { memberId: string }, keyof CreateMemberInput>
> {
  const access = await requireMembersPermission("members.create");
  if (!access.ok) return access;

  const parsed = createMemberSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        firstName: fieldErrors.firstName?.[0],
        fullLegalName: fieldErrors.fullLegalName?.[0],
        keycloakId: fieldErrors.keycloakId?.[0],
        lastName: fieldErrors.lastName?.[0],
        primaryEmail: fieldErrors.primaryEmail?.[0],
        username: fieldErrors.username?.[0],
      },
    };
  }

  try {
    const keycloak = createMembersKeycloakAdminClient();
    const resolvedKeycloakUser = parsed.data.keycloakId
      ? {
          localUsername: parsed.data.username,
          user: await keycloak.getUser(parsed.data.keycloakId),
        }
      : await (async () => {
          const existingUser = await keycloak.findUserByEmail(
            parsed.data.primaryEmail,
          );
          if (existingUser) {
            return {
              localUsername: existingUser.username,
              user: existingUser,
            };
          }

          const existingUsername = await keycloak.findUserByUsername(
            parsed.data.username,
          );
          if (existingUsername) {
            return {
              fieldError: "That username is already taken in Keycloak.",
            } as const;
          }

          return {
            localUsername: parsed.data.username,
            user: await keycloak.createUser({
              email: parsed.data.primaryEmail,
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
              username: parsed.data.username,
            }),
          };
        })();

    if ("fieldError" in resolvedKeycloakUser) {
      return {
        ok: false,
        message: resolvedKeycloakUser.fieldError || "Internal error",
        fieldErrors: {
          username: resolvedKeycloakUser.fieldError,
        },
      };
    }

    const { localUsername, user: keycloakUser } = resolvedKeycloakUser;
    const [member] = await db.transaction(async (tx) => {
      const createdMembers = await tx
        .insert(members)
        .values({
          firstName: parsed.data.firstName || keycloakUser.firstName || "",
          fullLegalName: parsed.data.fullLegalName,
          keycloakId: keycloakUser.id,
          lastName: parsed.data.lastName || keycloakUser.lastName || "",
          notes: parsed.data.notes,
          username: localUsername || keycloakUser.username,
        })
        .returning({ id: members.id });

      if (!createdMembers[0]) return [];
      await ensurePrimaryEmail(
        createdMembers[0].id,
        parsed.data.primaryEmail,
        tx,
      );
      return createdMembers;
    });

    if (!member) {
      return { ok: false, message: "Unable to create the member." };
    }

    revalidateMembers(member.id);
    return {
      ok: true,
      memberId: member.id,
      message: "Member created successfully.",
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That Keycloak user is already linked to a member.",
        fieldErrors: {
          keycloakId: "That Keycloak user is already linked to a member.",
        },
      };
    }
    return { ok: false, message: "Unable to create the member right now." };
  }
}

export async function updateMemberProfileAction(
  memberId: string,
  values: MemberProfileInput,
): Promise<ActionResult<ActionSuccess, keyof MemberProfileInput>> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const parsed = memberProfileSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        firstName: fieldErrors.firstName?.[0],
        fullLegalName: fieldErrors.fullLegalName?.[0],
        lastName: fieldErrors.lastName?.[0],
        primaryEmail: fieldErrors.primaryEmail?.[0],
        residenceRegion: fieldErrors.residenceRegion?.[0],
        username: fieldErrors.username?.[0],
      },
    };
  }

  const member = await getMemberIdentity(memberId);
  if (!member) return { ok: false, message: "That member could not be found." };

  try {
    await createMembersKeycloakAdminClient().updateUserProfile(
      member.keycloakId,
      {
        email: parsed.data.primaryEmail,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        username: parsed.data.username,
      },
    );
  } catch {
    return {
      ok: false,
      message: "Keycloak could not be updated. Local data was not changed.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({
        firstName: parsed.data.firstName,
        fullLegalName: parsed.data.fullLegalName,
        lastName: parsed.data.lastName,
        notes: parsed.data.notes ?? "",
        residenceRegion: parsed.data.residenceRegion || null,
        username: parsed.data.username,
      })
      .where(eq(members.id, memberId));
    await ensurePrimaryEmail(memberId, parsed.data.primaryEmail, tx);
  });

  revalidateMembers(memberId);
  return { ok: true, message: "Member profile updated successfully." };
}

export async function syncMemberFromKeycloakAction(
  memberId: string,
): Promise<ActionResult> {
  logMembersSyncEvent("info", "Starting member sync from Keycloak.", {
    memberId,
  });

  const access = await requireMembersPermission("members.update");
  if (!access.ok) {
    logMembersSyncEvent("warn", "Member sync blocked by permissions.", {
      memberId,
    });
    return access;
  }

  const member = await getMemberIdentity(memberId);
  if (!member) {
    logMembersSyncEvent("warn", "Member sync target was not found.", {
      memberId,
    });
    return { ok: false, message: "That member could not be found." };
  }

  try {
    const { keycloakUser, resolvedKeycloakId } =
      await getKeycloakUserForMemberSync(member);

    logMembersSyncEvent("info", "Fetched Keycloak user for member sync.", {
      hasEmail: Boolean(keycloakUser.email),
      keycloakId: resolvedKeycloakId,
      memberId,
      username: keycloakUser.username,
    });

    await db.transaction(async (tx) => {
      logMembersSyncEvent("info", "Writing synced member data.", {
        keycloakId: resolvedKeycloakId,
        memberId,
      });

      await tx
        .update(members)
        .set({
          firstName: keycloakUser.firstName ?? "",
          keycloakId: resolvedKeycloakId,
          lastName: keycloakUser.lastName ?? "",
          username: keycloakUser.username,
        })
        .where(eq(members.id, memberId));

      await syncPrimaryEmailFromKeycloak(memberId, keycloakUser.email, tx);
    });

    logMembersSyncEvent("info", "Member sync from Keycloak succeeded.", {
      keycloakId: resolvedKeycloakId,
      memberId,
    });
  } catch (error) {
    logMembersSyncEvent("error", "Member sync from Keycloak failed.", {
      keycloakId: member.keycloakId,
      memberId,
      ...getErrorLogDetails(error),
    });
    return { ok: false, message: "Unable to sync from Keycloak right now." };
  }

  revalidateMembers(memberId);
  return { ok: true, message: "Member synced from Keycloak." };
}

export async function setMemberDisabledAction(
  memberId: string,
  disabled: boolean,
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const currentMemberId = await getCurrentMemberId();
  if (disabled && currentMemberId === memberId) {
    return {
      ok: false,
      message: "You cannot disable your own member account.",
    };
  }

  const member = await getMemberIdentity(memberId);
  if (!member) return { ok: false, message: "That member could not be found." };

  try {
    await syncKeycloakClientAccess({
      disabled,
      hasActiveRole: disabled ? false : await memberHasActiveRole(memberId),
      keycloakId: member.keycloakId,
    });
    await syncMemberApplicationRoles({
      disabled,
      keycloakId: member.keycloakId,
      memberId,
    });
  } catch {
    return {
      ok: false,
      message:
        "Keycloak access could not be updated. Local status was not changed.",
    };
  }

  await db
    .update(members)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(members.id, memberId));

  revalidateMembers(memberId);
  return {
    ok: true,
    message: disabled ? "Member disabled." : "Member re-enabled.",
  };
}

export async function deleteMemberAction(
  memberId: string,
  mode: DeleteMemberMode,
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.delete");
  if (!access.ok) return access;

  const parsed = deleteMemberSchema.safeParse({ mode });
  if (!parsed.success) {
    return { ok: false, message: "Please choose a valid delete option." };
  }

  const currentMemberId = await getCurrentMemberId();
  if (currentMemberId === memberId) {
    return {
      ok: false,
      message: "You cannot delete your own member account.",
    };
  }

  const member = await getMemberIdentity(memberId);
  if (!member) return { ok: false, message: "That member could not be found." };

  try {
    if (parsed.data.mode === "local-and-keycloak") {
      await createMembersKeycloakAdminClient().deleteUser(member.keycloakId);
    } else if (parsed.data.mode === "local-and-revoke-helm") {
      const keycloak = createMembersKeycloakAdminClient();
      await keycloak.removeAllClientRoles(member.keycloakId);
      await syncMemberApplicationRoles({
        disabled: true,
        keycloakId: member.keycloakId,
        memberId,
      });
    }
  } catch (error) {
    logMembersSyncEvent(
      "error",
      "Keycloak cleanup before member delete failed.",
      {
        keycloakId: member.keycloakId,
        memberId,
        mode: parsed.data.mode,
        ...getErrorLogDetails(error),
      },
    );
    return {
      ok: false,
      message: "Keycloak could not be updated. Member was not deleted.",
    };
  }

  await db.delete(members).where(eq(members.id, memberId));

  revalidateMembers(memberId);
  return { ok: true, message: "Member deleted." };
}

export async function upsertContactAction(
  memberId: string,
  values: ContactInput,
  contactId?: string,
): Promise<ActionResult<ActionSuccess, keyof ContactInput>> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const parsed = contactInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        label: fieldErrors.label?.[0],
        type: fieldErrors.type?.[0],
        value: fieldErrors.value?.[0],
      },
    };
  }

  const member = await getMemberIdentity(memberId);
  if (!member) return { ok: false, message: "That member could not be found." };

  if (parsed.data.type === "email" && parsed.data.isPrimary) {
    try {
      await createMembersKeycloakAdminClient().updateUserProfile(
        member.keycloakId,
        {
          email: parsed.data.value,
          firstName: member.firstName,
          lastName: member.lastName,
          username: member.username,
        },
      );
    } catch {
      return {
        ok: false,
        message:
          "Keycloak email could not be updated. Local data was not changed.",
      };
    }
  }

  await db.transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(
          and(
            eq(contacts.memberId, memberId),
            eq(contacts.type, parsed.data.type as ContactType),
          ),
        );
    }

    if (contactId) {
      await tx
        .update(contacts)
        .set(parsed.data)
        .where(
          and(eq(contacts.id, contactId), eq(contacts.memberId, memberId)),
        );
      return;
    }

    const [sortRow] = await tx
      .select({ value: max(contacts.sortOrder) })
      .from(contacts)
      .where(eq(contacts.memberId, memberId));

    await tx.insert(contacts).values({
      ...parsed.data,
      memberId,
      sortOrder: Number(sortRow?.value ?? -1) + 1,
    });
  });

  revalidateMembers(memberId);
  return { ok: true, message: "Contact saved successfully." };
}

export async function deleteContactAction(
  memberId: string,
  contactId: string,
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.memberId, memberId)));

  revalidateMembers(memberId);
  return { ok: true, message: "Contact deleted successfully." };
}

export async function reorderContactsAction(
  memberId: string,
  contactIds: Array<string>,
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const parsed = reorderContactsSchema.safeParse({ contactIds });
  if (!parsed.success) return { ok: false, message: "Invalid contact order." };

  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.memberId, memberId));
  const existingIds = new Set(rows.map((row) => row.id));

  if (
    existingIds.size !== parsed.data.contactIds.length ||
    parsed.data.contactIds.some((id) => !existingIds.has(id))
  ) {
    return { ok: false, message: "Contact order is out of date." };
  }

  await db.transaction(async (tx) => {
    for (const [index, contactId] of parsed.data.contactIds.entries()) {
      await tx
        .update(contacts)
        .set({ sortOrder: -1000 - index })
        .where(eq(contacts.id, contactId));
    }
    for (const [index, contactId] of parsed.data.contactIds.entries()) {
      await tx
        .update(contacts)
        .set({ sortOrder: index })
        .where(eq(contacts.id, contactId));
    }
  });

  revalidateMembers(memberId);
  return { ok: true, message: "Contact order saved." };
}

export async function upsertAddressAction(
  memberId: string,
  values: AddressInput,
  addressId?: string,
): Promise<ActionResult<ActionSuccess, keyof AddressInput>> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const parsed = addressInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        city: fieldErrors.city?.[0],
        country: fieldErrors.country?.[0],
        label: fieldErrors.label?.[0],
        postalCode: fieldErrors.postalCode?.[0],
        street: fieldErrors.street?.[0],
      },
    };
  }

  if (addressId) {
    await db
      .update(addresses)
      .set(parsed.data)
      .where(
        and(eq(addresses.id, addressId), eq(addresses.memberId, memberId)),
      );
  } else {
    await db.insert(addresses).values({ ...parsed.data, memberId });
  }

  revalidateMembers(memberId);
  return { ok: true, message: "Address saved successfully." };
}

export async function deleteAddressAction(
  memberId: string,
  addressId: string,
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  await db
    .delete(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.memberId, memberId)));

  revalidateMembers(memberId);
  return { ok: true, message: "Address deleted successfully." };
}

export async function appendMembershipRenewalAction(
  memberId: string,
  values: MembershipRenewalInput,
): Promise<ActionResult<ActionSuccess, keyof MembershipRenewalInput>> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const parsed = membershipRenewalSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        endedAt: fieldErrors.endedAt?.[0],
        expiresAt: fieldErrors.expiresAt?.[0],
        extendedAt: fieldErrors.extendedAt?.[0],
      },
    };
  }

  await db.insert(memberships).values({
    endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    extendedAt: new Date(parsed.data.extendedAt),
    memberId,
  });

  revalidateMembers(memberId);
  return { ok: true, message: "Membership renewal added." };
}

export async function endMembershipAction(
  memberId: string,
  membershipId: string,
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.update");
  if (!access.ok) return access;

  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(eq(memberships.id, membershipId), eq(memberships.memberId, memberId)),
    )
    .limit(1);

  if (!membership) {
    return { ok: false, message: "That membership could not be found." };
  }

  await db
    .update(memberships)
    .set({ endedAt: new Date() })
    .where(eq(memberships.id, membershipId));

  revalidateMembers(memberId);
  return { ok: true, message: "Membership ended." };
}

export async function updateMemberRolesAction(
  memberId: string,
  assignments: Array<RoleAssignmentInput>,
  options: { revalidate?: boolean } = {},
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.role_management");
  if (!access.ok) return access;

  const parsed = roleAssignmentsSchema.safeParse({ assignments });
  if (!parsed.success) {
    return { ok: false, message: "Please choose valid roles." };
  }

  const member = await getMemberIdentity(memberId);
  if (!member) return { ok: false, message: "That member could not be found." };

  const roleIds = parsed.data.assignments.map(
    (assignment) => assignment.roleId,
  );
  let existingRoles: Array<{ id: string; rank: number }> = [];
  if (roleIds.length) {
    existingRoles = await db
      .select({ id: roles.id, rank: roles.rank })
      .from(roles)
      .where(inArray(roles.id, roleIds));
    if (existingRoles.length !== roleIds.length) {
      return { ok: false, message: "One or more roles could not be found." };
    }
  }

  const currentMemberId = await getCurrentMemberId();
  const currentUserHighestRank = await getCurrentUserHighestRoleRank();
  if (currentUserHighestRank === null) {
    return {
      ok: false,
      message: "You cannot manage roles without an active role.",
    };
  }

  if (existingRoles.some((role) => role.rank < currentUserHighestRank)) {
    return {
      ok: false,
      message: "You cannot manage roles above your highest role.",
    };
  }

  if (currentMemberId === memberId) {
    const keepsCriticalAccess = await roleGrantsAnyPermission(
      roleIds,
      CRITICAL_SELF_PERMISSIONS,
    );
    if (!keepsCriticalAccess) {
      return {
        ok: false,
        message: "You cannot remove your own member management access.",
      };
    }
  }

  const now = new Date();
  const hasActiveRole = !member.disabledAt && parsed.data.assignments.length > 0;

  try {
    await db.transaction(async (tx) => {
      await tx.delete(memberRoles).where(eq(memberRoles.memberId, memberId));
      if (parsed.data.assignments.length) {
        await tx.insert(memberRoles).values(
          parsed.data.assignments.map((assignment) => ({
            grantedAt: now,
            grantedBy: currentMemberId,
            memberId,
            roleId: assignment.roleId,
          })),
        );
      }

      await syncKeycloakClientAccess({
        disabled: Boolean(member.disabledAt),
        hasActiveRole,
        keycloakId: member.keycloakId,
      });
    });
  } catch (error) {
    logMembersSyncEvent(
      "error",
      "Keycloak access sync after role update failed.",
      {
        keycloakId: member.keycloakId,
        memberId,
        ...getErrorLogDetails(error),
      },
    );
    return {
      ok: false,
      message:
        "Keycloak access could not be updated. Member roles were not changed.",
    };
  }

  if (options.revalidate !== false) {
    revalidateMembers(memberId);
  }
  return { ok: true, message: "Member roles updated successfully." };
}

export async function setMemberRoleAssignmentAction(
  memberId: string,
  values: z.infer<typeof roleAssignmentToggleSchema>,
  options: { revalidate?: boolean } = {},
): Promise<ActionResult> {
  const access = await requireMembersPermission("members.role_management");
  if (!access.ok) return access;

  const parsed = roleAssignmentToggleSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Please choose a valid role." };
  }

  const member = await getMemberIdentity(memberId);
  if (!member) return { ok: false, message: "That member could not be found." };

  const [role] = await db
    .select({ id: roles.id, rank: roles.rank })
    .from(roles)
    .where(eq(roles.id, parsed.data.roleId));
  if (!role) {
    return { ok: false, message: "That role could not be found." };
  }

  const currentUserHighestRank = await getCurrentUserHighestRoleRank();
  if (currentUserHighestRank === null) {
    return {
      ok: false,
      message: "You cannot manage roles without an active role.",
    };
  }

  if (role.rank < currentUserHighestRank) {
    return {
      ok: false,
      message: "You cannot manage roles above your highest role.",
    };
  }

  const currentMemberId = await getCurrentMemberId();
  const currentRoleRows = await db
    .select({ roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(eq(memberRoles.memberId, memberId));
  const currentRoleIds = currentRoleRows.map((row) => row.roleId);
  const nextRoleIds = parsed.data.assigned
    ? [...new Set([...currentRoleIds, parsed.data.roleId])]
    : currentRoleIds.filter((roleId) => roleId !== parsed.data.roleId);

  if (currentMemberId === memberId) {
    const keepsCriticalAccess = await roleGrantsAnyPermission(
      nextRoleIds,
      CRITICAL_SELF_PERMISSIONS,
    );
    if (!keepsCriticalAccess) {
      return {
        ok: false,
        message: "You cannot remove your own member management access.",
      };
    }
  }

  const now = new Date();
  const hasActiveRole = !member.disabledAt && nextRoleIds.length > 0;

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(memberRoles)
        .where(
          and(
            eq(memberRoles.memberId, memberId),
            eq(memberRoles.roleId, parsed.data.roleId),
          ),
        );

      if (parsed.data.assigned) {
        await tx.insert(memberRoles).values({
          grantedAt: now,
          grantedBy: currentMemberId,
          memberId,
          roleId: parsed.data.roleId,
        });
      }

      await syncKeycloakClientAccess({
        disabled: Boolean(member.disabledAt),
        hasActiveRole,
        keycloakId: member.keycloakId,
      });
    });
  } catch (error) {
    logMembersSyncEvent(
      "error",
      "Keycloak access sync after role assignment update failed.",
      {
        keycloakId: member.keycloakId,
        memberId,
        ...getErrorLogDetails(error),
      },
    );
    return {
      ok: false,
      message:
        "Keycloak access could not be updated. Member roles were not changed.",
    };
  }

  if (options.revalidate !== false) {
    revalidateMembers(memberId);
  }
  return {
    ok: true,
    message: parsed.data.assigned ? "Role granted." : "Role removed.",
  };
}
