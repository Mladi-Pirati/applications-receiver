import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import {
  processProfilePicture,
  PROFILE_PICTURE_MAX_BYTES,
  ProfilePictureInputError,
} from "./profile-pictures";

async function image(
  format: "jpeg" | "png" | "webp",
  width = 400,
  height = 200,
) {
  const pipeline = sharp({
    create: {
      background: { alpha: 1, b: 96, g: 64, r: 32 },
      channels: 4,
      height,
      width,
    },
  });
  return pipeline[format]().toBuffer();
}

describe("profile picture processing", () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    test(`normalizes a ${format.toUpperCase()} square crop`, async () => {
      const result = await processProfilePicture(await image(format), {
        height: 100,
        width: 50,
        x: 25,
        y: 0,
      });
      const metadata = await sharp(result.body).metadata();

      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(512);
      expect(metadata.height).toBe(512);
      expect(metadata.pages ?? 1).toBe(1);
      expect(metadata.exif).toBeUndefined();
      expect(result.blurhash.length).toBeGreaterThan(5);
    });
  }

  test("applies EXIF orientation before percentage crop coordinates", async () => {
    const rotated = await sharp({
      create: {
        background: { alpha: 1, b: 32, g: 96, r: 64 },
        channels: 4,
        height: 400,
        width: 200,
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await processProfilePicture(rotated, {
      height: 100,
      width: 50,
      x: 25,
      y: 0,
    });
    const metadata = await sharp(result.body).metadata();

    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.orientation).toBeUndefined();
  });

  test("rejects invalid, unsupported, oversized, and undersized inputs", async () => {
    await expect(
      processProfilePicture(Buffer.from("not an image"), {
        height: 100,
        width: 100,
        x: 0,
        y: 0,
      }),
    ).rejects.toBeInstanceOf(ProfilePictureInputError);
    await expect(
      processProfilePicture(
        Buffer.from('<svg width="256" height="256"></svg>'),
        { height: 100, width: 100, x: 0, y: 0 },
      ),
    ).rejects.toThrow("Use a JPEG, PNG, or WebP image.");
    await expect(
      processProfilePicture(Buffer.alloc(PROFILE_PICTURE_MAX_BYTES + 1), {
        height: 100,
        width: 100,
        x: 0,
        y: 0,
      }),
    ).rejects.toThrow("10 MB or smaller");
    await expect(
      processProfilePicture(await image("png", 127, 256), {
        height: 49.609375,
        width: 100,
        x: 0,
        y: 0,
      }),
    ).rejects.toThrow("at least 128×128");
  });

  test("rejects out-of-bounds and non-square pixel crops", async () => {
    const source = await image("jpeg");
    await expect(
      processProfilePicture(source, {
        height: 100,
        width: 50,
        x: 51,
        y: 0,
      }),
    ).rejects.toThrow("valid crop");
    await expect(
      processProfilePicture(source, {
        height: 50,
        width: 50,
        x: 0,
        y: 0,
      }),
    ).rejects.toThrow("valid square crop");
  });
});
