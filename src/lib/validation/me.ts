import { z } from "zod";

import { residenceRegions } from "@/lib/membership-applications";
import {
  optionalText,
  primaryEmailSchema,
  trimmedRequired,
} from "@/lib/validation/members";

const dateOfBirthSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid date of birth.")
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    "Date of birth cannot be in the future.",
  )
  .optional()
  .or(z.literal(""));

export const selfProfileSchema = z.object({
  dateOfBirth: dateOfBirthSchema,
  firstName: trimmedRequired("First name", 120),
  fullLegalName: trimmedRequired("Full legal name", 200),
  lastName: trimmedRequired("Last name", 120),
  placeOfBirth: optionalText(200),
  primaryEmail: primaryEmailSchema,
  residenceRegion: z.enum(residenceRegions).optional().or(z.literal("")),
});

export type SelfProfileInput = z.infer<typeof selfProfileSchema>;
