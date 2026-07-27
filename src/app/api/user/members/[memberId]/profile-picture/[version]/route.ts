import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createCorsPreflightResponse, withCors } from "@/lib/api/cors";
import { verifyKeycloakAccessToken } from "@/lib/auth/keycloak-jwks";
import { isAppSessionUser } from "@/lib/auth/session";
import { getMemberProfilePictureObject } from "@/lib/profile-pictures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_OPTIONS = { methods: ["GET", "HEAD", "OPTIONS"] } as const;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export function OPTIONS(request: Request) {
  return createCorsPreflightResponse(request, CORS_OPTIONS);
}

async function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    try {
      await verifyKeycloakAccessToken(authorization.slice(7));
      return true;
    } catch {
      // A Helm browser session is an independent valid authentication method.
    }
  }
  const session = await auth();
  return isAppSessionUser(session?.user);
}

export async function GET(
  request: Request,
  context: RouteContext<
    "/api/user/members/[memberId]/profile-picture/[version]"
  >,
) {
  if (!(await isAuthorized(request))) {
    return withCors(
      request,
      NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: NO_STORE },
      ),
      CORS_OPTIONS,
    );
  }

  const { memberId, version } = await context.params;
  try {
    const object = await getMemberProfilePictureObject(memberId, version);
    if (!object?.Body) {
      return withCors(
        request,
        new NextResponse(null, { status: 404, headers: NO_STORE }),
        CORS_OPTIONS,
      );
    }
    const headers = new Headers({
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Type": object.ContentType ?? "image/webp",
    });
    if (object.ContentLength !== undefined) {
      headers.set("Content-Length", String(object.ContentLength));
    }
    if (object.ETag) headers.set("ETag", object.ETag);
    if (object.LastModified) {
      headers.set("Last-Modified", object.LastModified.toUTCString());
    }
    return withCors(
      request,
      new NextResponse(object.Body.transformToWebStream(), { headers }),
      CORS_OPTIONS,
    );
  } catch {
    return withCors(
      request,
      new NextResponse(null, { status: 404, headers: NO_STORE }),
      CORS_OPTIONS,
    );
  }
}
