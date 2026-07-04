import "dotenv/config";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { members, mladiPiratiMembershipApplications } from "@/db/schema";

const PROVISIONING_NOTE_PATTERN =
  /^Created from membership application (.+)\.$/;

export function parseApplicationIdFromNotes(notes: string | null) {
  if (!notes) return null;
  const match = notes.match(PROVISIONING_NOTE_PATTERN);
  return match?.[1] ?? null;
}

export type BackfillMemberApplicationDataRepository = {
  findApplicationById(id: string): Promise<{
    dateOfBirth: string;
    placeOfBirth: string;
    residenceRegion: string;
  } | null>;
  findMembersMissingApplicationLink(): Promise<
    Array<{ id: string; notes: string | null }>
  >;
  updateMemberApplicationData(
    memberId: string,
    data: {
      applicationId: string;
      dateOfBirth: string;
      placeOfBirth: string;
      residenceRegion: string;
    },
  ): Promise<void>;
};

export type BackfillSummary = {
  noNotesMatch: number;
  notFound: number;
  updated: number;
};

export async function backfillMemberApplicationData(
  repository: BackfillMemberApplicationDataRepository,
): Promise<BackfillSummary> {
  const summary: BackfillSummary = { noNotesMatch: 0, notFound: 0, updated: 0 };
  const candidates = await repository.findMembersMissingApplicationLink();

  for (const member of candidates) {
    const applicationId = parseApplicationIdFromNotes(member.notes);
    if (!applicationId) {
      summary.noNotesMatch += 1;
      continue;
    }

    const application = await repository.findApplicationById(applicationId);
    if (!application) {
      summary.notFound += 1;
      continue;
    }

    await repository.updateMemberApplicationData(member.id, {
      applicationId,
      dateOfBirth: application.dateOfBirth,
      placeOfBirth: application.placeOfBirth,
      residenceRegion: application.residenceRegion,
    });
    summary.updated += 1;
  }

  return summary;
}

function createBackfillMemberApplicationDataRepository(): BackfillMemberApplicationDataRepository {
  return {
    async findApplicationById(id) {
      const application =
        await db.query.mladiPiratiMembershipApplications.findFirst({
          columns: {
            dateOfBirth: true,
            placeOfBirth: true,
            residenceRegion: true,
          },
          where: eq(mladiPiratiMembershipApplications.id, id),
        });

      return application ?? null;
    },
    async findMembersMissingApplicationLink() {
      return db.query.members.findMany({
        columns: { id: true, notes: true },
        where: and(
          isNull(members.applicationId),
          isNull(members.dateOfBirth),
        ),
      });
    },
    async updateMemberApplicationData(memberId, data) {
      await db
        .update(members)
        .set({
          applicationId: data.applicationId,
          dateOfBirth: data.dateOfBirth,
          placeOfBirth: data.placeOfBirth,
          residenceRegion: data.residenceRegion,
        })
        .where(
          and(
            eq(members.id, memberId),
            isNull(members.applicationId),
            isNull(members.dateOfBirth),
          ),
        );
    },
  };
}

async function main() {
  const repository = createBackfillMemberApplicationDataRepository();
  const summary = await backfillMemberApplicationData(repository);

  console.log("Member application data backfill complete!", summary);
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exitCode = 1;
    })
    .finally(() => process.exit(process.exitCode ?? 0));
}
