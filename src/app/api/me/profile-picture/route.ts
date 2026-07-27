import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import { members } from "@/db/schema";
import { isAppSessionUser } from "@/lib/auth/session";
import {
  PROFILE_PICTURE_MAX_BYTES,
  ProfilePictureInputError,
  removeMemberProfilePicture,
  setMemberProfilePicture,
} from "@/lib/profile-pictures";

export const runtime = "nodejs";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const publicUrl = process.env.AUTH_URL;
  if (!origin || !publicUrl) return false;
  try {
    return new URL(origin).origin === new URL(publicUrl).origin;
  } catch {
    return false;
  }
}

async function getSelfMember() {
  const session = await auth();
  const user = session?.user;
  if (!isAppSessionUser(user)) return null;
  return db.query.members.findFirst({
    columns: { disabledAt: true, id: true },
    where: eq(
      members.keycloakId,
      (user as { keycloakUserId: string }).keycloakUserId,
    ),
  });
}

function numberField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? Number(value) : Number.NaN;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const member = await getSelfMember();
  if (!member || member.disabledAt) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  }
  if (file.size > PROFILE_PICTURE_MAX_BYTES) {
    return NextResponse.json(
      { error: "The image must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  try {
    const profilePicture = await setMemberProfilePicture(
      member.id,
      Buffer.from(await file.arrayBuffer()),
      {
        height: numberField(formData, "cropHeight"),
        width: numberField(formData, "cropWidth"),
        x: numberField(formData, "cropX"),
        y: numberField(formData, "cropY"),
      },
    );
    return NextResponse.json({ profilePicture }, { status: 201 });
  } catch (error) {
    if (error instanceof ProfilePictureInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[profile-picture]", error);
    return NextResponse.json(
      { error: "The profile picture could not be saved." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const member = await getSelfMember();
  if (!member || member.disabledAt) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await removeMemberProfilePicture(member.id);
  return new NextResponse(null, { status: 204 });
}
