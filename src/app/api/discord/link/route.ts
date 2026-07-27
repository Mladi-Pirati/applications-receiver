import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { discordLinkTokens, members } from "@/db/schema";
import { createCorsPreflightResponse, withCors } from "@/lib/api/cors";
import { db } from "@/db";
import { syncMemberDiscordRolesSafely } from "@/lib/discord/role-sync";
import { upsertDiscordContact } from "@/lib/member-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_OPTIONS = { methods: ["POST", "OPTIONS"] } as const;
const NO_CACHE = { "Cache-Control": "no-store" } as const;

const linkRequestSchema = z.object({
  token: z.string().min(1),
  discordUserId: z.string().min(1),
  discordUsername: z.string().min(1),
});

export function OPTIONS(request: Request) {
  return createCorsPreflightResponse(request, CORS_OPTIONS);
}

function hashSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export async function POST(request: NextRequest) {
  const secret = process.env.DISCORD_LINK_API_SECRET;
  if (!secret) {
    return withCors(
      request,
      NextResponse.json(
        { error: "not_configured" },
        { status: 503, headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return withCors(
      request,
      NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  }

  const providedSecret = authHeader.slice(7);
  try {
    const providedHash = hashSecret(providedSecret);
    const expectedHash = hashSecret(secret);
    if (!timingSafeEqual(providedHash, expectedHash)) {
      return withCors(
        request,
        NextResponse.json(
          { error: "unauthorized" },
          { status: 401, headers: NO_CACHE },
        ),
        CORS_OPTIONS,
      );
    }
  } catch {
    return withCors(
      request,
      NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(
      request,
      NextResponse.json(
        { error: "invalid_request" },
        { status: 400, headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  }

  const parsed = linkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(
      request,
      NextResponse.json(
        { error: "invalid_request" },
        { status: 400, headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  }

  const { token: rawToken, discordUserId, discordUsername } = parsed.data;
  const token = rawToken.trim().toUpperCase();
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const tokenRow = await tx.query.discordLinkTokens.findFirst({
        where: eq(discordLinkTokens.token, token),
      });

      if (!tokenRow) {
        return { status: 404 as const, error: "unknown_token" };
      }

      if (tokenRow.usedAt !== null || tokenRow.expiresAt < now) {
        return { status: 410 as const, error: "token_expired" };
      }

      const existingLink = await tx.query.members.findFirst({
        columns: { id: true },
        where: eq(members.discordUserId, discordUserId),
      });

      if (existingLink && existingLink.id !== tokenRow.memberId) {
        return { status: 409 as const, error: "already_linked" };
      }

      // Claim the token before writing anything else: the isNull guard keeps
      // it single-use under concurrent requests (returning early commits, so
      // no other writes may precede a non-200 return).
      const claimed = await tx
        .update(discordLinkTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(discordLinkTokens.id, tokenRow.id),
            isNull(discordLinkTokens.usedAt),
          ),
        )
        .returning({ id: discordLinkTokens.id });

      if (claimed.length === 0) {
        return { status: 410 as const, error: "token_expired" };
      }

      await tx
        .update(members)
        .set({ discordUserId })
        .where(eq(members.id, tokenRow.memberId));

      await upsertDiscordContact(tokenRow.memberId, discordUsername, tx);

      const member = await tx.query.members.findFirst({
        columns: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          discordUserId: true,
        },
        where: eq(members.id, tokenRow.memberId),
      });

      if (!member) {
        throw new Error("Member not found after update");
      }

      return {
        status: 200 as const,
        member,
      };
    });

    if (result.status === 200) {
      await syncMemberDiscordRolesSafely(result.member.id);
      return withCors(
        request,
        NextResponse.json(
          { member: result.member },
          { status: 200, headers: NO_CACHE },
        ),
        CORS_OPTIONS,
      );
    }

    return withCors(
      request,
      NextResponse.json(
        { error: result.error },
        { status: result.status, headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  } catch (error) {
    // Check for unique constraint violation on discordUserId
    if (error instanceof Error && error.message.includes("discord_user_id")) {
      return withCors(
        request,
        NextResponse.json(
          { error: "already_linked" },
          { status: 409, headers: NO_CACHE },
        ),
        CORS_OPTIONS,
      );
    }

    throw error;
  }
}
