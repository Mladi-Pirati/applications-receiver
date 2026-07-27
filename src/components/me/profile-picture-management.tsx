"use client";

import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlusIcon, Trash2Icon } from "lucide-react";

import { MemberAvatar } from "@/components/shared/member-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ProfilePictureDescriptor } from "@/lib/profile-pictures";

export function ProfilePictureManagement({
  firstName,
  lastName,
  profilePicture,
}: {
  firstName: string;
  lastName: string;
  profilePicture: ProfilePictureDescriptor | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function close() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setFile(null);
    setObjectUrl(null);
    setCropArea(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  async function upload() {
    if (!file || !cropArea) return;
    setPending(true);
    setMessage(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("cropX", String(cropArea.x));
    formData.set("cropY", String(cropArea.y));
    formData.set("cropWidth", String(cropArea.width));
    formData.set("cropHeight", String(cropArea.height));
    try {
      setUploadProgress(0);
      const result = await new Promise<{
        body: { error?: string };
        ok: boolean;
      }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/me/profile-picture");
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        });
        request.addEventListener("error", () => reject(new Error("Upload failed.")));
        request.addEventListener("load", () => {
          let body: { error?: string } = {};
          try {
            body = JSON.parse(request.responseText) as { error?: string };
          } catch {
            // The status still determines success for an empty or invalid body.
          }
          resolve({
            body,
            ok: request.status >= 200 && request.status < 300,
          });
        });
        request.send(formData);
      });
      if (!result.ok) throw new Error(result.body.error ?? "Upload failed.");
      close();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending(false);
      setUploadProgress(null);
    }
  }

  async function remove() {
    if (!window.confirm("Remove your profile picture?")) return;
    setPending(true);
    const response = await fetch("/api/me/profile-picture", { method: "DELETE" });
    if (response.ok) router.refresh();
    else setMessage("The profile picture could not be removed.");
    setPending(false);
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="font-bold">Profile picture</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4 p-4">
          <MemberAvatar
            className="size-20 text-lg"
            firstName={firstName}
            lastName={lastName}
            profilePicture={profilePicture}
          />
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => inputRef.current?.click()} type="button">
                <ImagePlusIcon />
                {profilePicture ? "Replace picture" : "Choose picture"}
              </Button>
              {profilePicture ? (
                <Button disabled={pending} onClick={remove} type="button" variant="outline">
                  <Trash2Icon />
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, or WebP; up to 10 MB.
            </p>
            {message ? <p className="text-xs text-destructive">{message}</p> : null}
          </div>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (!next) return;
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              setFile(next);
              setObjectUrl(URL.createObjectURL(next));
              setMessage(null);
            }}
            ref={inputRef}
            type="file"
          />
        </CardContent>
      </Card>
      <Dialog onOpenChange={(open) => { if (!open) close(); }} open={Boolean(objectUrl)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Crop profile picture</DialogTitle></DialogHeader>
          <div className="relative h-80 overflow-hidden rounded-md bg-black">
            {objectUrl ? (
              <Cropper
                aspect={1}
                crop={crop}
                cropShape="round"
                image={objectUrl}
                onCropChange={setCrop}
                onCropComplete={(area) => setCropArea(area)}
                onZoomChange={setZoom}
                showGrid={false}
                zoom={zoom}
              />
            ) : null}
          </div>
          <label className="grid gap-2 text-xs font-medium">
            Zoom
            <Input
              max={3}
              min={1}
              onChange={(event) => setZoom(Number(event.target.value))}
              step={0.01}
              type="range"
              value={zoom}
            />
          </label>
          {message ? <p className="text-xs text-destructive">{message}</p> : null}
          <DialogFooter>
            <Button onClick={close} type="button" variant="outline">Cancel</Button>
            <Button disabled={pending || !cropArea} onClick={upload} type="button">
              {pending
                ? `Uploading${uploadProgress === null ? "…" : ` ${uploadProgress}%`}`
                : "Save picture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
