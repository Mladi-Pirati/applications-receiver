"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  type MembershipApplicationStatus,
  mladiPiratiMembershipApplications,
} from "@/db/schema";
import { getCurrentUser, shouldForcePasswordChange } from "@/lib/auth/session";
import { membershipApplicationStatuses } from "@/lib/membership-applications";

type MembershipApplicationActionResult =
  | {
      ok: true;
      status: MembershipApplicationStatus;
      updatedAt: string;
    }
  | {
      ok: false;
      message: string;
    };

const updateMembershipApplicationStatusSchema = z.object({
  applicationId: z.string().trim().min(1, "Application id is required."),
  status: z.enum(membershipApplicationStatuses),
});

async function requireMembershipApplicationsAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false as const,
      message: "You are not allowed to review membership applications.",
    };
  }

  if (shouldForcePasswordChange(user)) {
    return {
      ok: false as const,
      message: "Change your password before reviewing membership applications.",
    };
  }

  if (user.role !== "admin") {
    return {
      ok: false as const,
      message: "You are not allowed to review membership applications.",
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function updateMembershipApplicationStatusAction(
  applicationId: string,
  status: MembershipApplicationStatus,
): Promise<MembershipApplicationActionResult> {
  const access = await requireMembershipApplicationsAdmin();

  if (!access.ok) {
    return {
      ok: false,
      message: access.message,
    };
  }

  const parsedValues = updateMembershipApplicationStatusSchema.safeParse({
    applicationId,
    status,
  });

  if (!parsedValues.success) {
    return {
      ok: false,
      message: "Please choose a valid application status.",
    };
  }

  let updatedApplication:
    | {
        status: MembershipApplicationStatus;
        updatedAt: Date;
      }
    | undefined;

  try {
    [updatedApplication] = await db
      .update(mladiPiratiMembershipApplications)
      .set({
        status: parsedValues.data.status,
        updatedAt: new Date(),
      })
      .where(
        eq(
          mladiPiratiMembershipApplications.id,
          parsedValues.data.applicationId,
        ),
      )
      .returning({
        status: mladiPiratiMembershipApplications.status,
        updatedAt: mladiPiratiMembershipApplications.updatedAt,
      });
  } catch {
    return {
      ok: false,
      message: "Unable to update the application right now.",
    };
  }

  if (!updatedApplication) {
    return {
      ok: false,
      message: "That application could not be found.",
    };
  }

  revalidatePath("/admin/membership-applications");
  revalidatePath(
    `/admin/membership-applications/${parsedValues.data.applicationId}`,
  );

  return {
    ok: true,
    status: updatedApplication.status,
    updatedAt: updatedApplication.updatedAt.toISOString(),
  };
}
