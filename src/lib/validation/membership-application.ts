import { z } from "zod";

import {
  participationModes,
  residenceRegions,
} from "@/lib/membership-applications";

export const RESIDENCE_REGIONS = residenceRegions;
export const PARTICIPATION_MODES = participationModes;

const optionalTrimmedString = (
  max: number,
  message: string,
) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmedValue = value.trim();
      return trimmedValue.length > 0 ? trimmedValue : undefined;
    },
    z.string().max(max, message).optional(),
  );

const requiredTrue = (message: string) =>
  z.boolean({ error: message }).refine((value) => value, { message });

export const membershipApplicationSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name is required.")
      .max(160, "Full name must be 160 characters or fewer."),
    dateOfBirth: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Date of birth must be in YYYY-MM-DD format.",
      ),
    placeOfBirth: z
      .string()
      .trim()
      .min(2, "Place of birth is required.")
      .max(160, "Place of birth must be 160 characters or fewer."),
    streetAddress: z
      .string()
      .trim()
      .min(3, "Street address is required.")
      .max(200, "Street address must be 200 characters or fewer."),
    cityAndPostalCode: z
      .string()
      .trim()
      .min(3, "City and postal code is required.")
      .max(160, "City and postal code must be 160 characters or fewer."),
    residenceRegion: z.enum(RESIDENCE_REGIONS, {
      error: "Residence region must be one of the hosted form options.",
    }),
    email: z.string().trim().email("A valid email address is required."),
    phone: optionalTrimmedString(40, "Phone must be 40 characters or fewer."),
    participationMode: z.enum(PARTICIPATION_MODES, {
      error: "Participation mode must be one of the hosted form options.",
    }),
    discordUsername: optionalTrimmedString(
      120,
      "Discord username must be 120 characters or fewer.",
    ),
    motivation: optionalTrimmedString(
      4000,
      "Motivation must be 4000 characters or fewer.",
    ),
    consentsToDataProcessing: requiredTrue(
      "Consent to data processing is required.",
    ),
    acceptsStatuteAndProgram: requiredTrue(
      "Acceptance of the statute and program is required.",
    ),
  })
  .passthrough();

export type MembershipApplicationInput = z.infer<
  typeof membershipApplicationSchema
>;
