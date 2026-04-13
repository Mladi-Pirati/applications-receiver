import { z } from "zod";

import { passwordSchema } from "@/lib/validation/passwords";

const changePasswordBaseSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, "Please confirm your new password."),
});

export function createChangePasswordSchema({
  requiresCurrentPassword,
}: {
  requiresCurrentPassword: boolean;
}) {
  return changePasswordBaseSchema.superRefine((value, context) => {
    if (requiresCurrentPassword && !value.currentPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current password is required.",
        path: ["currentPassword"],
      });
    }

    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }

    if (
      requiresCurrentPassword &&
      value.currentPassword &&
      value.currentPassword === value.newPassword
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password must be different from your current password.",
        path: ["newPassword"],
      });
    }
  });
}

export type ChangePasswordInput = z.infer<typeof changePasswordBaseSchema>;
