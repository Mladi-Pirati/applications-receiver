import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  backfillMemberApplicationData,
  parseApplicationIdFromNotes,
  type BackfillMemberApplicationDataRepository,
} from "./backfill-member-application-data";

function createRepositoryDouble(options: {
  applicationsById?: Record<
    string,
    { dateOfBirth: string; placeOfBirth: string; residenceRegion: string }
  >;
  members?: Array<{ id: string; notes: string | null }>;
}) {
  const updates: Array<{
    dateOfBirth: string;
    memberId: string;
    placeOfBirth: string;
    residenceRegion: string;
    applicationId: string;
  }> = [];

  const repository: BackfillMemberApplicationDataRepository = {
    async findMembersMissingApplicationLink() {
      return options.members ?? [];
    },
    async findApplicationById(id) {
      return options.applicationsById?.[id] ?? null;
    },
    async updateMemberApplicationData(memberId, data) {
      updates.push({ memberId, ...data });
    },
  };

  return { repository, updates };
}

describe("parseApplicationIdFromNotes", () => {
  test("extracts the application id from the provisioning note", () => {
    expect(
      parseApplicationIdFromNotes(
        "Created from membership application application-123.",
      ),
    ).toBe("application-123");
  });

  test("returns null for notes that do not match the provisioning pattern", () => {
    expect(parseApplicationIdFromNotes("Manually created by admin.")).toBe(
      null,
    );
    expect(parseApplicationIdFromNotes(null)).toBe(null);
  });
});

describe("backfillMemberApplicationData", () => {
  test("updates members whose notes reference a resolvable application", async () => {
    const { repository, updates } = createRepositoryDouble({
      applicationsById: {
        "application-1": {
          dateOfBirth: "1998-04-12",
          placeOfBirth: "Ljubljana",
          residenceRegion: "Osrednjeslovenska",
        },
      },
      members: [
        {
          id: "member-1",
          notes: "Created from membership application application-1.",
        },
      ],
    });

    const summary = await backfillMemberApplicationData(repository);

    expect(updates).toEqual([
      {
        applicationId: "application-1",
        dateOfBirth: "1998-04-12",
        memberId: "member-1",
        placeOfBirth: "Ljubljana",
        residenceRegion: "Osrednjeslovenska",
      },
    ]);
    expect(summary).toEqual({ noNotesMatch: 0, notFound: 0, updated: 1 });
  });

  test("skips and counts members whose notes do not reference an application", async () => {
    const { repository, updates } = createRepositoryDouble({
      members: [{ id: "member-1", notes: "Manually created by admin." }],
    });

    const summary = await backfillMemberApplicationData(repository);

    expect(updates).toEqual([]);
    expect(summary).toEqual({ noNotesMatch: 1, notFound: 0, updated: 0 });
  });

  test("skips and counts members whose referenced application no longer exists", async () => {
    const { repository, updates } = createRepositoryDouble({
      applicationsById: {},
      members: [
        {
          id: "member-1",
          notes: "Created from membership application missing-application.",
        },
      ],
    });

    const summary = await backfillMemberApplicationData(repository);

    expect(updates).toEqual([]);
    expect(summary).toEqual({ noNotesMatch: 0, notFound: 1, updated: 0 });
  });
});

describe("member application data backfill deploy wiring", () => {
  test("fails the command when the database cannot be reached", async () => {
    const proc = Bun.spawn(
      ["bun", "scripts/backfill-member-application-data.ts"],
      {
        env: {
          ...process.env,
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:1/helm",
        },
        stderr: "pipe",
        stdout: "pipe",
      },
    );

    await proc.exited;

    expect(proc.exitCode).not.toBe(0);
  });

  test("production deploy command runs the backfill after seeding", async () => {
    const packageJson = await readFile("package.json", "utf8");
    const scripts = JSON.parse(packageJson).scripts;

    expect(scripts["db:backfill-member-data"]).toBe(
      "bun scripts/backfill-member-application-data.ts",
    );
    expect(scripts["db:deploy"]).toContain("bun run db:migrate");
    expect(scripts["db:deploy"]).toContain("bun run db:seed");
    expect(scripts["db:deploy"]).toContain(
      "bun run db:backfill-member-data",
    );
  });
});
