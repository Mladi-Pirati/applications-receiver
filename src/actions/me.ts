"use server";

import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";

import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";

import {
  addresses,
  contacts,
  discordLinkTokens,
  members,
  type ContactType,
} from "@/db/schema";
import {
  createMembersKeycloakAdminClient,
  db,
  getCurrentUser,
  removeAllMemberDiscordRolesSafely,
} from "@/lib/me-action-dependencies";
import { ensurePrimaryEmail } from "@/lib/member-contacts";
import { selfProfileSchema, type SelfProfileInput } from "@/lib/validation/me";
import {
  addressInputSchema,
  contactInputSchema,
  type AddressInput,
  type ContactInput,
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

async function requireSelfMember() {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, message: "You must be signed in." };
  }

  const member = await db.query.members.findFirst({
    columns: {
      disabledAt: true,
      firstName: true,
      id: true,
      keycloakId: true,
      lastName: true,
      username: true,
    },
    where: eq(members.keycloakId, user.keycloakUserId),
  });

  if (!member) {
    return {
      ok: false as const,
      message: "Your member record could not be found.",
    };
  }

  if (member.disabledAt !== null) {
    return { ok: false as const, message: "Your account is disabled." };
  }

  return { ok: true as const, member };
}

async function getPrimaryEmail(memberId: string) {
  const row = await db.query.contacts.findFirst({
    columns: { value: true },
    where: and(
      eq(contacts.memberId, memberId),
      eq(contacts.type, "email"),
      eq(contacts.isPrimary, true),
    ),
  });

  return row?.value ?? null;
}

function revalidateSelf(memberId: string) {
  revalidatePath("/me");
  revalidatePath("/me/profile");
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
}

async function sendEmailVerification(keycloakId: string) {
  try {
    await createMembersKeycloakAdminClient().sendRequiredActionsEmail(
      keycloakId,
      ["VERIFY_EMAIL"],
    );
  } catch (error) {
    console.warn("[me-actions]", {
      message: "Could not send the email verification message.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateMyProfileAction(
  values: SelfProfileInput,
): Promise<ActionResult<ActionSuccess, keyof SelfProfileInput>> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  const parsed = selfProfileSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        dateOfBirth: fieldErrors.dateOfBirth?.[0],
        firstName: fieldErrors.firstName?.[0],
        fullLegalName: fieldErrors.fullLegalName?.[0],
        lastName: fieldErrors.lastName?.[0],
        placeOfBirth: fieldErrors.placeOfBirth?.[0],
        primaryEmail: fieldErrors.primaryEmail?.[0],
        residenceRegion: fieldErrors.residenceRegion?.[0],
      },
    };
  }

  const { member } = self;
  const currentPrimaryEmail = await getPrimaryEmail(member.id);
  const emailChanged = currentPrimaryEmail !== parsed.data.primaryEmail;
  const nameChanged =
    member.firstName !== parsed.data.firstName ||
    member.lastName !== parsed.data.lastName;

  if (emailChanged || nameChanged) {
    try {
      await createMembersKeycloakAdminClient().updateUserProfile(
        member.keycloakId,
        {
          email: parsed.data.primaryEmail,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          username: member.username,
        },
      );
    } catch (error) {
      if (getErrorResponseStatus(error) === 409) {
        return {
          ok: false,
          message: "Please fix the highlighted fields.",
          fieldErrors: { primaryEmail: "That email is already in use." },
        };
      }
      return {
        ok: false,
        message: "Keycloak could not be updated. Your data was not changed.",
      };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({
        dateOfBirth: parsed.data.dateOfBirth || null,
        firstName: parsed.data.firstName,
        fullLegalName: parsed.data.fullLegalName,
        lastName: parsed.data.lastName,
        placeOfBirth: parsed.data.placeOfBirth || null,
        residenceRegion: parsed.data.residenceRegion || null,
      })
      .where(eq(members.id, member.id));
    await ensurePrimaryEmail(member.id, parsed.data.primaryEmail, tx);
  });

  if (emailChanged) {
    await sendEmailVerification(member.keycloakId);
  }

  revalidateSelf(member.id);
  return { ok: true, message: "Profile updated successfully." };
}

export async function upsertMyContactAction(
  values: ContactInput,
  contactId?: string,
): Promise<ActionResult<ActionSuccess, keyof ContactInput>> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  const parsed = contactInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
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

  if (parsed.data.type === "discord") {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        type: "Discord is linked with a code via the /link command in Discord — use the Link button on the discord row.",
      },
    };
  }

  const { member } = self;
  let emailChanged = false;

  if (parsed.data.type === "email" && parsed.data.isPrimary) {
    const currentPrimaryEmail = await getPrimaryEmail(member.id);
    emailChanged = currentPrimaryEmail !== parsed.data.value;

    if (emailChanged) {
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
      } catch (error) {
        if (getErrorResponseStatus(error) === 409) {
          return {
            ok: false,
            message: "Please fix the highlighted fields.",
            fieldErrors: { value: "That email is already in use." },
          };
        }
        return {
          ok: false,
          message:
            "Keycloak email could not be updated. Your data was not changed.",
        };
      }
    }
  }

  await db.transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(
          and(
            eq(contacts.memberId, member.id),
            eq(contacts.type, parsed.data.type as ContactType),
          ),
        );
    }

    if (contactId) {
      await tx
        .update(contacts)
        .set(parsed.data)
        .where(
          and(eq(contacts.id, contactId), eq(contacts.memberId, member.id)),
        );
      return;
    }

    const [sortRow] = await tx
      .select({ value: max(contacts.sortOrder) })
      .from(contacts)
      .where(eq(contacts.memberId, member.id));

    await tx.insert(contacts).values({
      ...parsed.data,
      memberId: member.id,
      sortOrder: Number(sortRow?.value ?? -1) + 1,
    });
  });

  if (emailChanged) {
    await sendEmailVerification(member.keycloakId);
  }

  revalidateSelf(member.id);
  return { ok: true, message: "Contact saved successfully." };
}

export async function deleteMyContactAction(
  contactId: string,
): Promise<ActionResult> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  await db
    .delete(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.memberId, self.member.id)),
    );

  revalidateSelf(self.member.id);
  return { ok: true, message: "Contact deleted successfully." };
}

export async function upsertMyAddressAction(
  values: AddressInput,
  addressId?: string,
): Promise<ActionResult<ActionSuccess, keyof AddressInput>> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  const parsed = addressInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
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
        and(
          eq(addresses.id, addressId),
          eq(addresses.memberId, self.member.id),
        ),
      );
  } else {
    await db.insert(addresses).values({
      ...parsed.data,
      memberId: self.member.id,
    });
  }

  revalidateSelf(self.member.id);
  return { ok: true, message: "Address saved successfully." };
}

export async function deleteMyAddressAction(
  addressId: string,
): Promise<ActionResult> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  await db
    .delete(addresses)
    .where(
      and(eq(addresses.id, addressId), eq(addresses.memberId, self.member.id)),
    );

  revalidateSelf(self.member.id);
  return { ok: true, message: "Address deleted successfully." };
}

export async function generateDiscordLinkCodeAction(): Promise<
  ActionResult<{ ok: true; token: string; expiresAt: string }>
> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  const { member } = self;
  const tokenAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  // Generate 8-char token
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += tokenAlphabet[randomInt(32)];
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  await db.transaction(async (tx) => {
    // Delete previous unused tokens for this member
    await tx
      .delete(discordLinkTokens)
      .where(
        and(
          eq(discordLinkTokens.memberId, member.id),
          isNull(discordLinkTokens.usedAt),
        ),
      );

    // Insert new token
    await tx.insert(discordLinkTokens).values({
      memberId: member.id,
      token,
      expiresAt,
    });
  });

  return {
    ok: true,
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function unlinkDiscordAction(): Promise<ActionResult> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  // Remove synced roles while discordUserId is still set; the sync context
  // needs it to resolve the Discord account.
  await removeAllMemberDiscordRolesSafely(self.member.id);

  await db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({ discordUserId: null })
      .where(eq(members.id, self.member.id));
    await tx
      .delete(contacts)
      .where(
        and(
          eq(contacts.memberId, self.member.id),
          eq(contacts.type, "discord"),
        ),
      );
  });

  revalidateSelf(self.member.id);
  return { ok: true, message: "Discord account unlinked successfully." };
}
