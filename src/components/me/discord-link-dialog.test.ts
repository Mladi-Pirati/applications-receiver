import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

describe("Discord link dialog", () => {
  test("shows the verify-link command with the generated code", () => {
    const source = readFileSync(
      "src/components/me/discord-link-dialog.tsx",
      "utf8",
    );

    expect(source).toContain("/verify-link code:{code}");
    expect(source).not.toContain("/link {code}");
  });
});
