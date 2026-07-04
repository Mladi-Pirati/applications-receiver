import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createCorsPreflightResponse, withCors } from "@/lib/api/cors";
import { verifyKeycloakAccessToken } from "@/lib/auth/keycloak-jwks";
import { parseMembersCursorFilters } from "@/lib/members";
import { getMembersCursorPage } from "@/lib/members-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_OPTIONS = { methods: ["GET", "OPTIONS"] } as const;
const NO_CACHE = { "Cache-Control": "no-store" } as const;
const WWW_AUTH_NO_TOKEN = {
  "WWW-Authenticate": 'Bearer realm="helm"',
  "Cache-Control": "no-store",
} as const;
const WWW_AUTH_INVALID_TOKEN = {
  "WWW-Authenticate":
    'Bearer realm="helm", error="invalid_token", error_description="Token verification failed"',
  "Cache-Control": "no-store",
} as const;

export function OPTIONS(request: Request) {
  return createCorsPreflightResponse(request, CORS_OPTIONS);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return withCors(
      request,
      NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: WWW_AUTH_NO_TOKEN },
      ),
      CORS_OPTIONS,
    );
  }

  const token = authHeader.slice(7);
  try {
    await verifyKeycloakAccessToken(token);
  } catch {
    return withCors(
      request,
      NextResponse.json(
        { error: "Invalid token." },
        { status: 401, headers: WWW_AUTH_INVALID_TOKEN },
      ),
      CORS_OPTIONS,
    );
  }

  const filters = parseMembersCursorFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const result = await getMembersCursorPage(filters);

  return withCors(
    request,
    NextResponse.json(result, { headers: NO_CACHE }),
    CORS_OPTIONS,
  );
}
