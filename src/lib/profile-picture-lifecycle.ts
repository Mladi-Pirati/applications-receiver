export async function replaceProfilePictureVersion<T>({
  cleanupNew,
  cleanupPrevious,
  onCleanupError,
  persist,
  upload,
}: {
  cleanupNew: () => Promise<void>;
  cleanupPrevious?: () => Promise<void>;
  onCleanupError: (
    error: unknown,
    phase: "compensating" | "previous",
  ) => void;
  persist: () => Promise<T>;
  upload: () => Promise<void>;
}) {
  await upload();

  let result: T;
  try {
    result = await persist();
  } catch (error) {
    await cleanupNew().catch((cleanupError) => {
      onCleanupError(cleanupError, "compensating");
    });
    throw error;
  }

  if (cleanupPrevious) {
    await cleanupPrevious().catch((error) => {
      onCleanupError(error, "previous");
    });
  }
  return result;
}

export async function removeProfilePictureVersion({
  cleanup,
  clear,
  onCleanupError,
}: {
  cleanup: () => Promise<void>;
  clear: () => Promise<void>;
  onCleanupError: (error: unknown) => void;
}) {
  await clear();
  await cleanup().catch(onCleanupError);
}
