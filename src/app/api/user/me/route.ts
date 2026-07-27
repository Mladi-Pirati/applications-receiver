import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import {
  accessApplications,
  contacts,
  memberApplicationAccess,
  memberRoles,
  members,
  memberships,
  roles,
} from "@/db/schema";
import { createCorsPreflightResponse, withCors } from "@/lib/api/cors";
import { verifyKeycloakAccessToken } from "@/lib/auth/keycloak-jwks";
import { getProfilePictureDescriptor } from "@/lib/profile-pictures";

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
  let keycloakId: string;

  try {
    const payload = await verifyKeycloakAccessToken(token);
    if (!payload.sub) {
      return withCors(
        request,
        NextResponse.json(
          { error: "Invalid token." },
          { status: 401, headers: WWW_AUTH_INVALID_TOKEN },
        ),
        CORS_OPTIONS,
      );
    }
    keycloakId = payload.sub;
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

  try {
    const member = await db.query.members.findFirst({
      where: eq(members.keycloakId, keycloakId),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        disabledAt: true,
        profilePictureBlurhash: true,
        profilePictureVersion: true,
      },
    });

    if (!member) {
      return withCors(
        request,
        NextResponse.json(
          { error: "User not found." },
          { status: 404, headers: NO_CACHE },
        ),
        CORS_OPTIONS,
      );
    }

    if (member.disabledAt) {
      return withCors(
        request,
        NextResponse.json(
          { error: "Account disabled." },
          { status: 403, headers: NO_CACHE },
        ),
        CORS_OPTIONS,
      );
    }

    const [memberContacts, memberMemberships, memberRoleRows, memberApplications] =
      await Promise.all([
        db
          .select({
            type: contacts.type,
            value: contacts.value,
            label: contacts.label,
            isPrimary: contacts.isPrimary,
            sortOrder: contacts.sortOrder,
          })
          .from(contacts)
          .where(eq(contacts.memberId, member.id)),
        db
          .select({
            extendedAt: memberships.extendedAt,
            expiresAt: memberships.expiresAt,
            endedAt: memberships.endedAt,
          })
          .from(memberships)
          .where(eq(memberships.memberId, member.id)),
        db
          .select({
            key: roles.key,
            name: roles.name,
          })
          .from(memberRoles)
          .innerJoin(roles, eq(memberRoles.roleId, roles.id))
          .where(eq(memberRoles.memberId, member.id)),
        db
          .select({
            id: accessApplications.id,
            name: accessApplications.name,
            keycloakClientId: accessApplications.keycloakClientId,
          })
          .from(memberApplicationAccess)
          .innerJoin(
            accessApplications,
            eq(memberApplicationAccess.applicationId, accessApplications.id),
          )
          .where(
            and(
              eq(memberApplicationAccess.memberId, member.id),
              isNull(accessApplications.archivedAt),
            ),
          ),
      ]);

    return withCors(
      request,
      NextResponse.json(
        {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          username: member.username,
          profilePicture: getProfilePictureDescriptor(member),
          contacts: memberContacts,
          memberships: memberMemberships,
          roles: memberRoleRows,
          applications: memberApplications,
        },
        { headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  } catch {
    return withCors(
      request,
      NextResponse.json(
        { error: "Internal server error." },
        { status: 500, headers: NO_CACHE },
      ),
      CORS_OPTIONS,
    );
  }
}
