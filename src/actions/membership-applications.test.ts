import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { sendDiscordApprovalEvent } from "@/lib/discord/approval-events";

let allowed = true;
let applicationRows: Record<
  string,
  {
    cityAndPostalCode: string;
    dateOfBirth: string;
    discordUsername: string | null;
    email: string;
    firstName: string;
    id: string;
    lastName: string;
    phone: string | null;
    placeOfBirth: string;
    residenceRegion: string;
    status: "pending" | "approved" | "rejected";
    streetAddress: string;
  }
> = {};
let revalidatedPaths: Array<string> = [];
let provisionedApplicationIds: Array<string> = [];
let provisionedApplications: Array<Record<string, unknown>> = [];
let discordApprovalEvents: Array<Record<string, unknown>> = [];
let discordApprovalEventRequests: Array<{
  headers: Headers;
  input: RequestInfo | URL;
  method: string | undefined;
}> = [];
let discordApprovalEventShouldFail = false;
let currentUpdateApplicationId = "application-1";
let currentUpdateApplicationIds: Array<string> = [];
let currentFindFirstApplicationIds: Array<string> = [];
const originalConsoleError = console.error;
const originalFetch = globalThis.fetch;
const originalWebhookUrl = process.env.DISCORD_BOT_APPROVAL_WEBHOOK_URL;
const originalWebhookSecret = process.env.DISCORD_BOT_APPROVAL_WEBHOOK_SECRET;

async function captureDiscordApprovalEventFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  discordApprovalEventRequests.push({
    headers: new Headers(init?.headers),
    input,
    method: init?.method,
  });
  discordApprovalEvents.push(JSON.parse(String(init?.body)));

  if (discordApprovalEventShouldFail) {
    throw new Error("Discord bot unavailable");
  }

  return new Response(null, { status: 204 });
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function hasPermission(permissionKey: string) {
  expect(["members.delete", "members.read"]).toContain(permissionKey);
  return allowed;
}

async function provisionMembershipApplicationMember(application: {
  id: string;
}) {
  provisionedApplicationIds.push(application.id);
  provisionedApplications.push(application);
  return {
    keycloakId: `keycloak-${application.id}`,
    memberId: `member-${application.id}`,
    status: "success" as const,
  };
}

function revalidatePath(path: string) {
  revalidatedPaths.push(path);
}

function getApplication(applicationId: string) {
  return applicationRows[applicationId] ?? null;
}

type MockUpdateSetValues = {
  memberCreationStatus?: "success" | "fail" | null;
  rejectionReason?: string | null;
  status?: "pending" | "approved" | "rejected";
};

const db = {
  query: {
    mladiPiratiMembershipApplications: {
      async findFirst(query?: { columns?: Record<string, boolean> }) {
        const application = getApplication(
          currentFindFirstApplicationIds.shift() ?? "application-1",
        );
        if (!application || !query?.columns) return application;

        return Object.fromEntries(
          Object.entries(query.columns)
            .filter(([, selected]) => selected)
            .map(([key]) => [
              key,
              (application as Record<string, unknown>)[key],
            ]),
        );
      },
    },
  },
  update() {
    let values: MockUpdateSetValues = {};

    return {
      set(nextValues: MockUpdateSetValues) {
        values = nextValues;

        return {
          where() {
            const applicationIds = currentUpdateApplicationIds.length
              ? currentUpdateApplicationIds
              : [currentUpdateApplicationId];

            for (const applicationId of applicationIds) {
              const application = applicationRows[applicationId];
              if (!application) continue;

              if (values.status) application.status = values.status;
              if ("rejectionReason" in values) {
                applicationRows[applicationId] = {
                  ...application,
                  rejectionReason: values.rejectionReason,
                } as (typeof applicationRows)[string];
              }
            }

            return {
              async returning(selection: Record<string, unknown>) {
                const keys = Object.keys(selection);

                if (keys.includes("status")) {
                  const application = getApplication(applicationIds[0] ?? "");
                  return application
                    ? [
                        {
                          status: application.status,
                          rejectionReason: null,
                          memberCreationStatus: null,
                          updatedAt: new Date("2026-06-07T10:00:00.000Z"),
                        },
                      ]
                    : [];
                }

                return applicationIds
                  .filter((applicationId) => getApplication(applicationId))
                  .map((applicationId) => ({ id: applicationId }));
              },
            };
          },
        };
      },
    };
  },
  delete() {
    return {
      where() {
        return {
          async returning() {
            const applicationIds = currentUpdateApplicationIds.length
              ? currentUpdateApplicationIds
              : [currentUpdateApplicationId];
            const deletedApplicationIds = applicationIds.filter(
              (applicationId) => applicationRows[applicationId],
            );

            for (const applicationId of deletedApplicationIds) {
              delete applicationRows[applicationId];
            }

            return deletedApplicationIds.map((id) => ({ id }));
          },
        };
      },
    };
  },
};

mock.module("next/cache", () => ({ revalidatePath }));
mock.module("@/lib/membership-application-action-dependencies", () => ({
  db,
  hasPermission,
  provisionMembershipApplicationMember,
  sendDiscordApprovalEvent,
}));

const membershipApplicationActionsPromise = import("./membership-applications");

afterAll(() => {
  console.error = originalConsoleError;
  globalThis.fetch = originalFetch;
  restoreEnvValue(
    "DISCORD_BOT_APPROVAL_WEBHOOK_URL",
    originalWebhookUrl,
  );
  restoreEnvValue(
    "DISCORD_BOT_APPROVAL_WEBHOOK_SECRET",
    originalWebhookSecret,
  );
  mock.restore();
});

beforeEach(() => {
  allowed = true;
  applicationRows = {
    "application-1": {
      cityAndPostalCode: "1000 Ljubljana",
      dateOfBirth: "1998-04-12",
      discordUsername: "ana",
      email: "ana@example.test",
      firstName: "Ana",
      id: "application-1",
      lastName: "Novak",
      phone: null,
      placeOfBirth: "Ljubljana",
      residenceRegion: "Osrednjeslovenska",
      status: "pending",
      streetAddress: "Piratska 1",
    },
    "application-2": {
      cityAndPostalCode: "1000 Ljubljana",
      dateOfBirth: "1995-11-02",
      discordUsername: null,
      email: "bor@example.test",
      firstName: "Bor",
      id: "application-2",
      lastName: "Kralj",
      phone: null,
      placeOfBirth: "Maribor",
      residenceRegion: "Podravska",
      status: "pending",
      streetAddress: "Piratska 2",
    },
  };
  revalidatedPaths = [];
  provisionedApplicationIds = [];
  provisionedApplications = [];
  discordApprovalEvents = [];
  discordApprovalEventRequests = [];
  discordApprovalEventShouldFail = false;
  currentUpdateApplicationId = "application-1";
  currentUpdateApplicationIds = [];
  currentFindFirstApplicationIds = [];
  process.env.DISCORD_BOT_APPROVAL_WEBHOOK_URL = "https://bot.test/approval";
  process.env.DISCORD_BOT_APPROVAL_WEBHOOK_SECRET = "test-secret";
  globalThis.fetch = captureDiscordApprovalEventFetch as typeof fetch;
  console.error = (() => {}) as typeof console.error;
});

describe("membership application Discord approval events", () => {
  test("single approval emits a Discord approval event with the application username", async () => {
    const { updateMembershipApplicationStatusAction } =
      await membershipApplicationActionsPromise;

    const result = await updateMembershipApplicationStatusAction(
      "application-1",
      { status: "approved" },
    );

    expect(result).toMatchObject({
      ok: true,
      status: "approved",
      memberCreationStatus: "success",
    });
    expect(provisionedApplicationIds).toEqual(["application-1"]);
    expect(provisionedApplications[0]).toMatchObject({
      dateOfBirth: "1998-04-12",
      placeOfBirth: "Ljubljana",
      residenceRegion: "Osrednjeslovenska",
    });
    expect(discordApprovalEvents).toHaveLength(1);
    expect(discordApprovalEvents[0]).toMatchObject({
      event: "membership_application_approved",
      applicationId: "application-1",
      discordUsername: "ana",
    });
    expect(discordApprovalEventRequests[0]?.method).toBe("POST");
  });

  test("non-approval status changes do not emit Discord approval events", async () => {
    const { updateMembershipApplicationStatusAction } =
      await membershipApplicationActionsPromise;

    const result = await updateMembershipApplicationStatusAction(
      "application-1",
      {
        status: "rejected",
        rejectionReason: "This application is missing required information.",
      },
    );

    expect(result).toMatchObject({ ok: true, status: "rejected" });
    expect(provisionedApplicationIds).toEqual([]);
    expect(discordApprovalEvents).toEqual([]);
  });

  test("bulk approval emits one event per approved application with a Discord username", async () => {
    const { bulkMembershipApplicationAction } =
      await membershipApplicationActionsPromise;
    currentUpdateApplicationIds = ["application-1", "application-2"];
    currentFindFirstApplicationIds = ["application-1", "application-2"];

    const result = await bulkMembershipApplicationAction({
      action: "approve",
      applicationIds: ["application-1", "application-2"],
    });

    expect(result).toMatchObject({
      ok: true,
      affectedCount: 2,
      memberCreationFailureCount: 0,
    });
    expect(provisionedApplicationIds).toEqual([
      "application-1",
      "application-2",
    ]);
    expect(discordApprovalEvents.map((event) => event.applicationId)).toEqual([
      "application-1",
    ]);
  });

  test("delete action does not emit Discord approval events", async () => {
    const { deleteMembershipApplicationAction } =
      await membershipApplicationActionsPromise;

    const result = await deleteMembershipApplicationAction("application-1");

    expect(result).toMatchObject({ ok: true });
    expect(provisionedApplicationIds).toEqual([]);
    expect(discordApprovalEvents).toEqual([]);
  });

  test("Discord event failures do not fail approval", async () => {
    const { updateMembershipApplicationStatusAction } =
      await membershipApplicationActionsPromise;
    discordApprovalEventShouldFail = true;

    const result = await updateMembershipApplicationStatusAction(
      "application-1",
      { status: "approved" },
    );

    expect(result).toMatchObject({
      ok: true,
      status: "approved",
      memberCreationStatus: "success",
    });
    expect(discordApprovalEvents).toHaveLength(1);
  });
});
