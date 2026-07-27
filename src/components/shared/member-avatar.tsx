"use client";

import { decode } from "blurhash";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { ProfilePictureDescriptor } from "@/lib/profile-pictures";

const placeholderCache = new Map<string, string>();

function blurhashDataUrl(value: string) {
  const cached = placeholderCache.get(value);
  if (cached) return cached;
  if (typeof document === "undefined") return "";
  const size = 24;
  const pixels = decode(value, size, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.putImageData(
    new ImageData(new Uint8ClampedArray(Array.from(pixels)), size, size),
    0,
    0,
  );
  const result = canvas.toDataURL();
  placeholderCache.set(value, result);
  return result;
}

export function MemberAvatar({
  className,
  firstName,
  lastName,
  profilePicture,
}: {
  className?: string;
  firstName: string;
  lastName: string;
  profilePicture: ProfilePictureDescriptor | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const placeholder = useMemo(
    () =>
      profilePicture ? blurhashDataUrl(profilePicture.blurhash) : undefined,
    [profilePicture],
  );
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const pictureUrl = profilePicture?.url ?? null;
  const showPicture = pictureUrl !== null && failedUrl !== pictureUrl;

  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {profilePicture && showPicture ? (
        // The protected Helm route is already normalized and versioned.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setFailedUrl(profilePicture.url)}
          src={profilePicture.url}
          style={
            placeholder
              ? { backgroundImage: `url(${placeholder})`, backgroundSize: "cover" }
              : undefined
          }
        />
      ) : (
        initials || "?"
      )}
    </span>
  );
}
