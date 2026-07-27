"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  accessApplications,
  memberApplicationAccess,
  members,
} from "@/db/schema";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addKeycloakApplicationRole,
  isApplicationGrantedByGroup,
  removeKeycloakApplicationRole,
  syncApplicationMappingChange,
  syncArchivedApplicationRoles,
} from "@/lib/application-access-sync";
import { createKeycloakAdminClient } from "@/lib/keycloak/admin-client";
import {
  applicationAccessAssignmentSchema,
  createAccessApplicationSchema,
  keycloakClientRolesInputSchema,
  keycloakClientSearchSchema,
  type ApplicationAccessAssignmentInput,
  type CreateAccessApplicationInput,
  type UpdateAccessApplicationInput,
  updateAccessApplicationSchema,
} from "@/lib/validation/access-applications";

type ActionSuccess = { ok: true; message?: string };
type ActionFailure<TField extends string = string> = {
  ok: false;
  message: string;
  fieldErrors?: Partial<Record<TField, string>>;
};
type ActionResult<T = ActionSuccess, TField extends string = string> =
  | T
  | ActionFailure<TField>;

async function requireAccessControlPermission() {
  const allowed = await hasPermission("access-control.manage_roles");
  if (!allowed) {
    return {
      ok: false as const,
      message: "You are not allowed to manage application access.",
    };
  }
  return { ok: true as const };
}

async function requireMemberRoleManagementPermission() {
  const allowed = await hasPermission("members.role_management");
  if (!allowed) {
    return {
      ok: false as const,
      message: "You are not allowed to manage member access.",
    };
  }
  return { ok: true as const };
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

function getFieldErrors<T extends string>(
  error: {
    flatten: () => { fieldErrors: Record<string, Array<string> | undefined> };
  },
  fields: Array<T>,
) {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.fromEntries(
    fields.map((field) => [field, fieldErrors[field]?.[0]]),
  ) as Partial<Record<T, string>>;
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

async function validateKeycloakMapping(values: {
  keycloakClientId: string;
  keycloakRoleName: string;
}) {
  const keycloak = createKeycloakAdminClient();
  const roles = await keycloak.listRolesForClient(values.keycloakClientId);
  if (!roles.some((role) => role.name === values.keycloakRoleName)) {
    throw new Error("Keycloak role was not found on the selected client.");
  }
}

async function findActiveApplicationConflict(values: {
  applicationId?: string;
  keycloakClientId: string;
  keycloakRoleName: string;
  name: string;
}) {
  const rows = await db
    .select({
      id: accessApplications.id,
      keycloakClientId: accessApplications.keycloakClientId,
      keycloakRoleName: accessApplications.keycloakRoleName,
      name: accessApplications.name,
    })
    .from(accessApplications)
    .where(isNull(accessApplications.archivedAt));

  return rows.find((row) => {
    if (row.id === values.applicationId) return false;
    return (
      row.name === values.name ||
      (row.keycloakClientId === values.keycloakClientId &&
        row.keycloakRoleName === values.keycloakRoleName)
    );
  });
}

export async function searchKeycloakClientsAction(query: string): Promise<
  ActionResult<{
    ok: true;
    clients: Array<{ clientId: string; id: string }>;
  }>
> {
  const access = await requireAccessControlPermission();
  if (!access.ok) return access;

  const parsed = keycloakClientSearchSchema.safeParse({ q: query });
  if (!parsed.success) return { ok: true, clients: [] };

  try {
    const clients = await createKeycloakAdminClient().searchClients(
      parsed.data.q,
    );
    return { ok: true, clients };
  } catch {
    return {
      ok: false,
      message: "Unable to search Keycloak clients right now.",
    };
  }
}

export async function listKeycloakClientRolesAction(clientId: string): Promise<
  ActionResult<{
    ok: true;
    roles: Array<{ id: string; name: string }>;
  }>
> {
  const access = await requireAccessControlPermission();
  if (!access.ok) return access;

  const parsed = keycloakClientRolesInputSchema.safeParse({ clientId });
  if (!parsed.success) return { ok: true, roles: [] };

  try {
    const roles = await createKeycloakAdminClient().listRolesForClient(
      parsed.data.clientId,
    );
    return { ok: true, roles };
  } catch {
    return {
      ok: false,
      message: "Unable to load Keycloak client roles right now.",
    };
  }
}

export async function createAccessApplicationAction(
  values: CreateAccessApplicationInput,
): Promise<ActionResult<ActionSuccess, keyof CreateAccessApplicationInput>> {
  const access = await requireAccessControlPermission();
  if (!access.ok) return access;

  const parsed = createAccessApplicationSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: getFieldErrors(parsed.error, [
        "description",
        "keycloakClientId",
        "keycloakRoleName",
        "name",
      ]),
    };
  }

  const conflict = await findActiveApplicationConflict(parsed.data);
  if (conflict) {
    return {
      ok: false,
      message:
        "An active application already uses that name or Keycloak client role.",
    };
  }

  try {
    await validateKeycloakMapping(parsed.data);
    await db.insert(accessApplications).values(parsed.data);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message:
          "An active application already uses that name or Keycloak client role.",
      };
    }
    return {
      ok: false,
      message: "Unable to validate or save the Keycloak application mapping.",
    };
  }

  revalidatePath("/admin/settings/roles");
  return { ok: true, message: "Application created successfully." };
}

export async function updateAccessApplicationAction(
  applicationId: string,
  values: UpdateAccessApplicationInput,
): Promise<ActionResult<ActionSuccess, keyof UpdateAccessApplicationInput>> {
  const access = await requireAccessControlPermission();
  if (!access.ok) return access;

  const application = await db.query.accessApplications.findFirst({
    where: eq(accessApplications.id, applicationId),
  });
  if (!application) {
    return { ok: false, message: "That application could not be found." };
  }
  if (application.archivedAt) {
    return { ok: false, message: "Archived applications cannot be edited." };
  }

  const parsed = updateAccessApplicationSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: getFieldErrors(parsed.error, [
        "description",
        "keycloakClientId",
        "keycloakRoleName",
        "name",
      ]),
    };
  }

  const conflict = await findActiveApplicationConflict({
    ...parsed.data,
    applicationId,
  });
  if (conflict) {
    return {
      ok: false,
      message:
        "An active application already uses that name or Keycloak client role.",
    };
  }

  const mappingChanged =
    application.keycloakClientId !== parsed.data.keycloakClientId ||
    application.keycloakRoleName !== parsed.data.keycloakRoleName;

  try {
    await validateKeycloakMapping(parsed.data);
    if (mappingChanged) {
      await syncApplicationMappingChange({
        applicationId,
        nextApplication: parsed.data,
        previousApplication: application,
      });
    }
    await db
      .update(accessApplications)
      .set(parsed.data)
      .where(eq(accessApplications.id, applicationId));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message:
          "An active application already uses that name or Keycloak client role.",
      };
    }
    return {
      ok: false,
      message: "Unable to validate or update the Keycloak application mapping.",
    };
  }

  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin/members");
  return { ok: true, message: "Application updated successfully." };
}

export async function setAccessApplicationArchivedAction(
  applicationId: string,
  archived: boolean,
): Promise<ActionResult> {
  const access = await requireAccessControlPermission();
  if (!access.ok) return access;

  const application = await db.query.accessApplications.findFirst({
    where: eq(accessApplications.id, applicationId),
  });
  if (!application) {
    return { ok: false, message: "That application could not be found." };
  }
  if (Boolean(application.archivedAt) === archived) {
    return {
      ok: true,
      message: archived
        ? "Application is already archived."
        : "Application is active.",
    };
  }

  try {
    await syncArchivedApplicationRoles({ applicationId, archived });
    await db
      .update(accessApplications)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(accessApplications.id, applicationId));
  } catch {
    return {
      ok: false,
      message: archived
        ? "Keycloak roles could not be revoked. Application was not archived."
        : "Keycloak roles could not be restored. Application was not unarchived.",
    };
  }

  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin/members");
  return {
    ok: true,
    message: archived ? "Application archived." : "Application restored.",
  };
}

export async function setMemberApplicationAccessAction(
  memberId: string,
  values: ApplicationAccessAssignmentInput,
  options: { revalidate?: boolean } = {},
): Promise<ActionResult> {
  const access = await requireMemberRoleManagementPermission();
  if (!access.ok) return access;

  const parsed = applicationAccessAssignmentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Please choose a valid application." };
  }

  const [member, application] = await Promise.all([
    db.query.members.findFirst({
      columns: { disabledAt: true, id: true, keycloakId: true },
      where: eq(members.id, memberId),
    }),
    db.query.accessApplications.findFirst({
      where: and(
        eq(accessApplications.id, parsed.data.applicationId),
        isNull(accessApplications.archivedAt),
      ),
    }),
  ]);
  if (!member) return { ok: false, message: "That member could not be found." };
  if (!application) {
    return {
      ok: false,
      message: "That active application could not be found.",
    };
  }

  const currentMemberId = await getCurrentMemberId();
  const stillGrantedByGroup = parsed.data.assigned
    ? false
    : await isApplicationGrantedByGroup(memberId, application.id);

  try {
    if (!member.disabledAt) {
      if (parsed.data.assigned) {
        await addKeycloakApplicationRole({
          application,
          keycloakId: member.keycloakId,
        });
      } else if (!stillGrantedByGroup) {
        await removeKeycloakApplicationRole({
          application,
          keycloakId: member.keycloakId,
        });
      }
    }

    if (parsed.data.assigned) {
      await db
        .insert(memberApplicationAccess)
        .values({
          applicationId: application.id,
          grantedBy: currentMemberId,
          memberId,
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(memberApplicationAccess)
        .where(
          and(
            eq(memberApplicationAccess.applicationId, application.id),
            eq(memberApplicationAccess.memberId, memberId),
          ),
        );
    }
  } catch {
    return {
      ok: false,
      message: parsed.data.assigned
        ? "Keycloak access could not be granted. Local access was not changed."
        : "Keycloak access could not be removed. Local access was not changed.",
    };
  }

  if (options.revalidate !== false) {
    revalidatePath(`/admin/members/${memberId}`);
    revalidatePath("/admin/members");
  }
  return {
    ok: true,
    message: parsed.data.assigned
      ? "Application access granted."
      : stillGrantedByGroup
        ? "Direct access removed. Access is still granted via a group."
        : "Application access removed.",
  };
}
