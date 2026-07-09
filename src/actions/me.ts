"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";

import { addresses, contacts, members, type ContactType } from "@/db/schema";
import {
  createDiscordBotClient,
  createMembersKeycloakAdminClient,
  db,
  getCurrentUser,
  syncMemberDiscordRolesSafely,
} from "@/lib/me-action-dependencies";
import { ensurePrimaryEmail, upsertDiscordContact } from "@/lib/member-contacts";
import { discordUserIdSchema } from "@/lib/validation/discord";
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
        type: "Discord accounts are linked by Discord user ID from the Discord section.",
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

export async function updateMyDiscordIdAction(
  discordUserId: string,
): Promise<ActionResult<ActionSuccess, "discordUserId">> {
  const self = await requireSelfMember();
  if (!self.ok) return self;

  const parsed = discordUserIdSchema.safeParse(discordUserId);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        discordUserId:
          parsed.error.issues[0]?.message ?? "Enter a valid Discord user ID.",
      },
    };
  }

  const { member } = self;
  const existingOwner = await db.query.members.findFirst({
    columns: { discordUserId: true, id: true },
    where: eq(members.discordUserId, parsed.data),
  });
  if (existingOwner && existingOwner.id !== member.id) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        discordUserId:
          "That Discord account is already linked to another member.",
      },
    };
  }

  let guildMember: Awaited<
    ReturnType<ReturnType<typeof createDiscordBotClient>["getGuildMember"]>
  >;
  try {
    guildMember = await createDiscordBotClient().getGuildMember(parsed.data);
  } catch {
    return {
      ok: false,
      message: "The Discord bot could not be reached. Please try again later.",
    };
  }
  if (!guildMember) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        discordUserId: "That account is not a member of the Discord server.",
      },
    };
  }

  const resolvedUsername = guildMember.username;
  await db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({ discordUserId: parsed.data })
      .where(eq(members.id, member.id));
    await upsertDiscordContact(member.id, resolvedUsername, tx);
  });

  await syncMemberDiscordRolesSafely(member.id);
  revalidateSelf(member.id);
  return {
    ok: true,
    message: `Discord account @${resolvedUsername} linked successfully.`,
  };
}
