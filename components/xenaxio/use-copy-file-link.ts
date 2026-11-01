"use client";

// Xenaxio step 116: "Copy link" for a file or folder in Files.
import { useCallback } from "react";
import { useCopyLink } from "@/hooks/use-copy-link";
import { useFileStore, type FileResource } from "@/stores/file-store";
import { fileLinkPath, fileLinkTarget } from "@/lib/xenaxio/file-link";

/**
 * Puts the link to a listed file or folder on the clipboard: by id in its
 * owner's account, so it opens for colleagues it is shared with as well.
 */
export function useCopyFileLink(): (resource: Pick<FileResource, "id" | "ownerAccountId" | "isShared">) => void {
  const copyLink = useCopyLink();
  return useCallback((resource) => {
    const filesAccountId = useFileStore.getState().client?.getFilesAccountId() ?? null;
    void copyLink(fileLinkPath(fileLinkTarget(resource, filesAccountId)));
  }, [copyLink]);
}
