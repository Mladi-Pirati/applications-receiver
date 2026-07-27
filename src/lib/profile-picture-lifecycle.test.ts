import { describe, expect, test } from "bun:test";

import {
  removeProfilePictureVersion,
  replaceProfilePictureVersion,
} from "./profile-picture-lifecycle";

describe("profile picture replacement lifecycle", () => {
  test("uploads before persistence and then removes the former object", async () => {
    const events: Array<string> = [];
    const result = await replaceProfilePictureVersion({
      upload: async () => {
        events.push("upload");
      },
      persist: async () => {
        events.push("persist");
        return "descriptor";
      },
      cleanupNew: async () => {
        events.push("cleanup-new");
      },
      cleanupPrevious: async () => {
        events.push("cleanup-previous");
      },
      onCleanupError: () => undefined,
    });

    expect(result).toBe("descriptor");
    expect(events).toEqual(["upload", "persist", "cleanup-previous"]);
  });

  test("does not update the database after an upload failure", async () => {
    const events: Array<string> = [];
    await expect(
      replaceProfilePictureVersion({
        upload: async () => {
          events.push("upload");
          throw new Error("S3 unavailable");
        },
        persist: async () => {
          events.push("persist");
          return "descriptor";
        },
        cleanupNew: async () => {
          events.push("cleanup-new");
        },
        onCleanupError: () => undefined,
      }),
    ).rejects.toThrow("S3 unavailable");

    expect(events).toEqual(["upload"]);
  });

  test("compensates after persistence failure", async () => {
    const events: Array<string> = [];
    await expect(
      replaceProfilePictureVersion({
        upload: async () => {
          events.push("upload");
        },
        persist: async () => {
          events.push("persist");
          throw new Error("Database unavailable");
        },
        cleanupNew: async () => {
          events.push("cleanup-new");
        },
        onCleanupError: () => undefined,
      }),
    ).rejects.toThrow("Database unavailable");

    expect(events).toEqual(["upload", "persist", "cleanup-new"]);
  });

  test("keeps a usable replacement when former-object cleanup fails", async () => {
    const cleanupErrors: Array<string> = [];
    const result = await replaceProfilePictureVersion({
      upload: async () => undefined,
      persist: async () => "descriptor",
      cleanupNew: async () => undefined,
      cleanupPrevious: async () => {
        throw new Error("cleanup failed");
      },
      onCleanupError: (error, phase) => {
        cleanupErrors.push(`${phase}:${String(error)}`);
      },
    });

    expect(result).toBe("descriptor");
    expect(cleanupErrors[0]).toContain("previous:Error: cleanup failed");
  });
});

describe("profile picture removal lifecycle", () => {
  test("clears visibility before deleting the private object", async () => {
    const events: Array<string> = [];
    await removeProfilePictureVersion({
      clear: async () => {
        events.push("clear");
      },
      cleanup: async () => {
        events.push("cleanup");
      },
      onCleanupError: () => undefined,
    });

    expect(events).toEqual(["clear", "cleanup"]);
  });

  test("does not restore visibility when orphan cleanup fails", async () => {
    const events: Array<string> = [];
    await removeProfilePictureVersion({
      clear: async () => {
        events.push("clear");
      },
      cleanup: async () => {
        events.push("cleanup");
        throw new Error("S3 unavailable");
      },
      onCleanupError: () => {
        events.push("logged");
      },
    });

    expect(events).toEqual(["clear", "cleanup", "logged"]);
  });
});
