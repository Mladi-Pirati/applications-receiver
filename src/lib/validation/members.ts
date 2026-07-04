import { z } from "zod";

import { ADDRESS_LABELS, CONTACT_TYPES } from "@/db/schema";
import { residenceRegions } from "@/lib/membership-applications";

const trimmedRequired = (field: string, max = 160) =>
  z.string().trim().min(1, `${field} is required.`).max(max);

const optionalText = (max = 1000) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const primaryEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(320, "Email must be 320 characters or fewer.");

export const createMemberSchema = z.object({
  firstName: trimmedRequired("First name", 120),
  keycloakId: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal(""))
    .default(""),
  lastName: trimmedRequired("Last name", 120),
  fullLegalName: trimmedRequired("Full legal name", 200),
  notes: optionalText().default(""),
  primaryEmail: primaryEmailSchema,
  username: trimmedRequired("Username", 120),
});

export const memberProfileSchema = z.object({
  firstName: trimmedRequired("First name", 120),
  lastName: trimmedRequired("Last name", 120),
  fullLegalName: trimmedRequired("Full legal name", 200),
  notes: optionalText(),
  primaryEmail: primaryEmailSchema,
  residenceRegion: z.enum(residenceRegions).optional().or(z.literal("")),
  username: trimmedRequired("Username", 120),
});

export const contactInputSchema = z
  .object({
    isPrimary: z.boolean().default(false),
    label: optionalText(80),
    type: z.enum(CONTACT_TYPES),
    value: trimmedRequired("Contact value", 320),
  })
  .superRefine((contact, context) => {
    if (contact.type !== "email") return;

    const parsedEmail = primaryEmailSchema.safeParse(contact.value);
    if (!parsedEmail.success) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid email address.",
        path: ["value"],
      });
    }
  })
  .transform((contact) => ({
    ...contact,
    value:
      contact.type === "email" ? contact.value.trim().toLowerCase() : contact.value,
  }));

export const addressInputSchema = z.object({
  city: trimmedRequired("City", 120),
  country: trimmedRequired("Country", 120),
  label: z.enum(ADDRESS_LABELS),
  postalCode: trimmedRequired("Postal code", 40),
  street: trimmedRequired("Street", 200),
});

export const membershipRenewalSchema = z
  .object({
    endedAt: z.string().trim().optional().or(z.literal("")),
    expiresAt: z.string().trim().optional().or(z.literal("")),
    extendedAt: z.string().trim().min(1, "Extension date is required."),
  })
  .superRefine((value, context) => {
    const extendedAt = new Date(value.extendedAt);
    const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
    const endedAt = value.endedAt ? new Date(value.endedAt) : null;

    if (Number.isNaN(extendedAt.getTime())) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid extension date.",
        path: ["extendedAt"],
      });
    }

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid expiry date.",
        path: ["expiresAt"],
      });
    }

    if (endedAt && Number.isNaN(endedAt.getTime())) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid end date.",
        path: ["endedAt"],
      });
    }

    if (
      !Number.isNaN(extendedAt.getTime()) &&
      expiresAt &&
      !Number.isNaN(expiresAt.getTime()) &&
      expiresAt <= extendedAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Expiry date must be after the extension date.",
        path: ["expiresAt"],
      });
    }

    if (
      !Number.isNaN(extendedAt.getTime()) &&
      endedAt &&
      !Number.isNaN(endedAt.getTime()) &&
      endedAt < extendedAt
    ) {
      context.addIssue({
        code: "custom",
        message: "End date must be on or after the extension date.",
        path: ["endedAt"],
      });
    }
  });

export const roleAssignmentSchema = z
  .object({
    roleId: trimmedRequired("Role", 160),
  })
  .strict();

export const reorderContactsSchema = z.object({
  contactIds: z.array(trimmedRequired("Contact id", 160)).min(1),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type MemberProfileInput = z.infer<typeof memberProfileSchema>;
export type ContactInput = z.infer<typeof contactInputSchema>;
export type AddressInput = z.infer<typeof addressInputSchema>;
export type MembershipRenewalInput = z.infer<typeof membershipRenewalSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;
