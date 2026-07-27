import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { encode } from "blurhash";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "@/db";
import { members } from "@/db/schema";
import {
  removeProfilePictureVersion,
  replaceProfilePictureVersion,
} from "@/lib/profile-picture-lifecycle";

export const PROFILE_PICTURE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const OUTPUT_SIZE = 512;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type ProfilePictureDescriptor = {
  blurhash: string;
  url: string;
  version: string;
};

export type ProfilePictureCrop = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export class ProfilePictureInputError extends Error {}

let client: S3Client | null = null;

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function getS3Client() {
  if (client) return client;
  client = new S3Client({
    credentials: {
      accessKeyId: requiredEnvironment("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironment("S3_SECRET_ACCESS_KEY"),
    },
    endpoint: requiredEnvironment("S3_ENDPOINT"),
    forcePathStyle: true,
    region: requiredEnvironment("S3_REGION"),
  });
  return client;
}

function getObjectKey(memberId: string, version: string) {
  return `profile-pictures/${memberId}/${version}.webp`;
}

function getPublicOrigin() {
  return requiredEnvironment("AUTH_URL").replace(/\/$/, "");
}

export function getProfilePictureDescriptor(member: {
  id: string;
  profilePictureBlurhash: string | null;
  profilePictureVersion: string | null;
}): ProfilePictureDescriptor | null {
  if (!member.profilePictureVersion || !member.profilePictureBlurhash) {
    return null;
  }

  return {
    blurhash: member.profilePictureBlurhash,
    url: `${getPublicOrigin()}/api/user/members/${encodeURIComponent(member.id)}/profile-picture/${encodeURIComponent(member.profilePictureVersion)}`,
    version: member.profilePictureVersion,
  };
}

function validateCrop(crop: ProfilePictureCrop) {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new ProfilePictureInputError("The crop is invalid.");
  }
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > 100.001 ||
    crop.y + crop.height > 100.001
  ) {
    throw new ProfilePictureInputError("Choose a valid crop.");
  }
}

export async function processProfilePicture(
  input: Buffer,
  crop: ProfilePictureCrop,
) {
  if (input.byteLength > PROFILE_PICTURE_MAX_BYTES) {
    throw new ProfilePictureInputError("The image must be 10 MB or smaller.");
  }
  validateCrop(crop);

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, {
      animated: true,
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
  } catch {
    throw new ProfilePictureInputError("The selected file is not a valid image.");
  }

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new ProfilePictureInputError("Use a JPEG, PNG, or WebP image.");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new ProfilePictureInputError("Animated images are not supported.");
  }

  const orientedWidth =
    (metadata.orientation ?? 1) >= 5 ? metadata.height : metadata.width;
  const orientedHeight =
    (metadata.orientation ?? 1) >= 5 ? metadata.width : metadata.height;
  if (!orientedWidth || !orientedHeight) {
    throw new ProfilePictureInputError("The image dimensions could not be read.");
  }
  if (orientedWidth < 128 || orientedHeight < 128) {
    throw new ProfilePictureInputError("The image must be at least 128×128.");
  }

  const left = Math.max(0, Math.round((crop.x / 100) * orientedWidth));
  const top = Math.max(0, Math.round((crop.y / 100) * orientedHeight));
  const width = Math.min(
    orientedWidth - left,
    Math.max(1, Math.round((crop.width / 100) * orientedWidth)),
  );
  const height = Math.min(
    orientedHeight - top,
    Math.max(1, Math.round((crop.height / 100) * orientedHeight)),
  );
  if (
    width < 1 ||
    height < 1 ||
    Math.abs(width - height) > 2
  ) {
    throw new ProfilePictureInputError("Choose a valid square crop.");
  }
  const side = Math.min(width, height);

  const body = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .extract({ height: side, left, top, width: side })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "fill" })
    .webp({ quality: 82 })
    .toBuffer();

  const { data, info } = await sharp(body)
    .resize(32, 32, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    blurhash: encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      4,
      3,
    ),
    body,
  };
}

export async function setMemberProfilePicture(
  memberId: string,
  input: Buffer,
  crop: ProfilePictureCrop,
) {
  const processed = await processProfilePicture(input, crop);
  const version = crypto.randomUUID();
  const objectKey = getObjectKey(memberId, version);
  const bucket = requiredEnvironment("S3_BUCKET");
  const current = await db.query.members.findFirst({
    columns: { profilePictureVersion: true },
    where: eq(members.id, memberId),
  });
  if (!current) throw new Error("Member not found.");

  const previousVersion = current.profilePictureVersion;
  return replaceProfilePictureVersion({
    upload: async () => {
      await getS3Client().send(
        new PutObjectCommand({
          Body: processed.body,
          Bucket: bucket,
          ContentType: "image/webp",
          Key: objectKey,
        }),
      );
    },
    persist: async () => {
      const [updated] = await db
        .update(members)
        .set({
          profilePictureBlurhash: processed.blurhash,
          profilePictureVersion: version,
        })
        .where(eq(members.id, memberId))
        .returning({
          id: members.id,
          profilePictureBlurhash: members.profilePictureBlurhash,
          profilePictureVersion: members.profilePictureVersion,
        });
      if (!updated) throw new Error("Member not found.");
      return getProfilePictureDescriptor(updated)!;
    },
    cleanupNew: () => deleteObject(memberId, version),
    cleanupPrevious: previousVersion
      ? () => deleteObject(memberId, previousVersion)
      : undefined,
    onCleanupError: (error, phase) => {
      console.warn("[profile-picture]", {
        error: error instanceof Error ? error.message : String(error),
        memberId,
        message:
          phase === "compensating"
            ? "Could not delete a failed profile picture upload."
            : "Could not delete the replaced profile picture.",
      });
    },
  });
}

async function deleteObject(memberId: string, version: string) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: requiredEnvironment("S3_BUCKET"),
      Key: getObjectKey(memberId, version),
    }),
  );
}

export async function removeMemberProfilePicture(memberId: string) {
  const current = await db.query.members.findFirst({
    columns: { profilePictureVersion: true },
    where: eq(members.id, memberId),
  });
  if (!current) throw new Error("Member not found.");
  if (!current.profilePictureVersion) return false;

  await removeProfilePictureVersion({
    clear: async () => {
      await db
        .update(members)
        .set({ profilePictureBlurhash: null, profilePictureVersion: null })
        .where(eq(members.id, memberId));
    },
    cleanup: () => deleteObject(memberId, current.profilePictureVersion!),
    onCleanupError: (error) => {
      console.warn("[profile-picture]", {
        error: error instanceof Error ? error.message : String(error),
        memberId,
        message: "Could not delete the removed profile picture object.",
      });
    },
  });
  return true;
}

export async function getMemberProfilePictureObject(
  memberId: string,
  version: string,
) {
  const member = await db.query.members.findFirst({
    columns: { profilePictureVersion: true },
    where: eq(members.id, memberId),
  });
  if (member?.profilePictureVersion !== version) return null;

  return getS3Client().send(
    new GetObjectCommand({
      Bucket: requiredEnvironment("S3_BUCKET"),
      Key: getObjectKey(memberId, version),
    }),
  );
}
