// Xenaxio step 88: opening a file from a search hit, a link or the recent
// list, and saying which file is gone when it cannot be found.
import { isFilePreviewable } from "@/lib/file-preview";
import { isImageFile } from "@/components/files/file-icons";

export type FileOpenKind = "edit" | "image" | "preview" | "select";

/**
 * How a file opens: like a double click in the list, except that a file the
 * app cannot show is only selected in its folder instead of being downloaded.
 */
export function fileOpenKind(name: string, isOfficeEditable: (name: string) => boolean): FileOpenKind {
  if (isOfficeEditable(name)) return "edit";
  if (isImageFile(name)) return "image";
  if (isFilePreviewable(name)) return "preview";
  return "select";
}

/**
 * A linked file still waiting to open, once its folder is listed: "wait" while
 * the listing has it (the preview effect opens it), "missing" when the folder
 * lacks it, "drop" when the listing failed (the page shows that error).
 */
export function linkedFileState(name: string, listing: { resources: { name: string }[]; error: string | null }): "wait" | "missing" | "drop" {
  if (listing.error) return "drop";
  return listing.resources.some((r) => r.name === name) ? "wait" : "missing";
}

export interface RevealRecentDeps {
  revealNode: (id: string) => Promise<string | null>;
  recentFiles: { id: string; name: string }[];
  removeRecentFile: (id: string) => void;
  /** Error toast: a title and, when known, the file name as its second line. */
  showError: (title: string, detail?: string) => void;
  notFoundTitle: string;
  loadFailedTitle: string;
}

/**
 * Opens the folder of a recent file and returns its name. A file that is gone
 * is reported by name and dropped from the list; a failed listing gets its
 * own message, since the file may well still be there.
 */
export async function revealRecentFile(id: string, deps: RevealRecentDeps): Promise<string | null> {
  let name: string | null;
  try {
    name = await deps.revealNode(id);
  } catch (err) {
    console.error("Failed to list files:", err);
    deps.showError(deps.loadFailedTitle);
    return null;
  }
  if (name) return name;
  deps.showError(deps.notFoundTitle, deps.recentFiles.find((r) => r.id === id)?.name);
  deps.removeRecentFile(id);
  return null;
}
