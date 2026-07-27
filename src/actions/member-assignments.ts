"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setMemberApplicationAccessAction } from "@/actions/access-applications";
import { setMemberGroupAssignmentAction } from "@/actions/groups";
import { setMemberRoleAssignmentAction } from "@/actions/members";
import { hasPermission } from "@/lib/auth/permissions";

const assignmentIdSchema = z.string().trim().min(1).max(255);
const uniqueAssignmentIdsSchema = z
  .array(assignmentIdSchema)
  .transform((ids) => [...new Set(ids)]);
const memberIdsSchema = uniqueAssignmentIdsSchema.pipe(
  z.array(assignmentIdSchema).min(1, "Select at least one member.").max(100),
);

const bulkMemberAccessAssignmentSchema = z
  .object({
    applicationIds: uniqueAssignmentIdsSchema.default([]),
    groupIds: uniqueAssignmentIdsSchema.default([]),
    memberIds: memberIdsSchema,
    roleIds: uniqueAssignmentIdsSchema.default([]),
  })
  .superRefine((values, context) => {
    const assignmentCount =
      values.applicationIds.length +
      values.groupIds.length +
      values.roleIds.length;

    if (assignmentCount === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one role, group, or application.",
        path: ["roleIds"],
      });
      return;
    }

    if (values.memberIds.length * assignmentCount > 1_000) {
      context.addIssue({
        code: "custom",
        message:
          "This batch is too large. Choose fewer members or assignments.",
        path: ["memberIds"],
      });
    }
  });

export type BulkMemberAssignmentKind = "application" | "group" | "role";

export type BulkMemberAssignmentFailure = {
  assignmentId: string;
  kind: BulkMemberAssignmentKind;
  memberId: string;
  message: string;
};

export type BulkMemberAccessAssignmentResult =
  | {
      ok: false;
      message: string;
    }
  | {
      failedAssignmentCount: number;
      failedMemberCount: number;
      failures: Array<BulkMemberAssignmentFailure>;
      message: string;
      ok: true;
      successfulAssignmentCount: number;
    };

type AssignmentActionResult = {
  message?: string;
  ok: boolean;
};

async function processWithConcurrency<T, TResult>(
  items: Array<T>,
  concurrency: number,
  processItem: (item: T) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const itemIndex = nextIndex;
      nextIndex += 1;
      results[itemIndex] = await processItem(items[itemIndex]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );

  return results;
}

function buildBulkAssignmentMessage(values: {
  failedAssignmentCount: number;
  failedMemberCount: number;
  memberCount: number;
  successfulAssignmentCount: number;
}) {
  const successLabel =
    values.successfulAssignmentCount === 1 ? "assignment" : "assignments";
  const memberLabel = values.memberCount === 1 ? "member" : "members";

  if (values.failedAssignmentCount === 0) {
    return `${values.successfulAssignmentCount} ${successLabel} granted across ${values.memberCount} ${memberLabel}.`;
  }

  const failureLabel =
    values.failedAssignmentCount === 1 ? "assignment" : "assignments";
  const failedMemberLabel =
    values.failedMemberCount === 1 ? "member" : "members";

  if (values.successfulAssignmentCount === 0) {
    return `No assignments were granted. ${values.failedAssignmentCount} ${failureLabel} failed across ${values.failedMemberCount} ${failedMemberLabel}.`;
  }

  return `${values.successfulAssignmentCount} ${successLabel} granted; ${values.failedAssignmentCount} ${failureLabel} failed across ${values.failedMemberCount} ${failedMemberLabel}.`;
}

export async function bulkAssignMemberAccessAction(values: {
  applicationIds?: Array<string>;
  groupIds?: Array<string>;
  memberIds: Array<string>;
  roleIds?: Array<string>;
}): Promise<BulkMemberAccessAssignmentResult> {
  if (!(await hasPermission("members.role_management"))) {
    return {
      ok: false,
      message: "You are not allowed to manage member access.",
    };
  }

  const parsed = bulkMemberAccessAssignmentSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please choose valid members and assignments.",
    };
  }

  const processMember = async (memberId: string) => {
    let successfulAssignmentCount = 0;
    const failures: Array<BulkMemberAssignmentFailure> = [];

    async function runAssignment(
      kind: BulkMemberAssignmentKind,
      assignmentId: string,
      action: () => Promise<AssignmentActionResult>,
    ) {
      try {
        const result = await action();
        if (result.ok) {
          successfulAssignmentCount += 1;
          return;
        }

        failures.push({
          assignmentId,
          kind,
          memberId,
          message: result.message ?? "Unable to grant this assignment.",
        });
      } catch {
        failures.push({
          assignmentId,
          kind,
          memberId,
          message: "Unable to grant this assignment.",
        });
      }
    }

    for (const roleId of parsed.data.roleIds) {
      await runAssignment("role", roleId, () =>
        setMemberRoleAssignmentAction(
          memberId,
          { assigned: true, roleId },
          { revalidate: false },
        ),
      );
    }

    for (const groupId of parsed.data.groupIds) {
      await runAssignment("group", groupId, () =>
        setMemberGroupAssignmentAction(
          memberId,
          { assigned: true, groupId },
          { revalidate: false },
        ),
      );
    }

    for (const applicationId of parsed.data.applicationIds) {
      await runAssignment("application", applicationId, () =>
        setMemberApplicationAccessAction(
          memberId,
          { applicationId, assigned: true },
          { revalidate: false },
        ),
      );
    }

    return { failures, successfulAssignmentCount };
  };

  const memberResults = await processWithConcurrency(
    parsed.data.memberIds,
    5,
    processMember,
  );
  const failures = memberResults.flatMap((result) => result.failures);
  const successfulAssignmentCount = memberResults.reduce(
    (total, result) => total + result.successfulAssignmentCount,
    0,
  );
  const failedMemberCount = new Set(
    failures.map((failure) => failure.memberId),
  ).size;

  revalidatePath("/admin/members");
  if (parsed.data.groupIds.length > 0) {
    revalidatePath("/admin/settings/roles");
  }
  for (const memberId of parsed.data.memberIds) {
    revalidatePath(`/admin/members/${memberId}`);
  }

  return {
    failedAssignmentCount: failures.length,
    failedMemberCount,
    failures,
    message: buildBulkAssignmentMessage({
      failedAssignmentCount: failures.length,
      failedMemberCount,
      memberCount: parsed.data.memberIds.length,
      successfulAssignmentCount,
    }),
    ok: true,
    successfulAssignmentCount,
  };
}
