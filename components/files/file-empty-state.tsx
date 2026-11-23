"use client";

import { useTranslations } from "next-intl";
import { Upload, FolderPlus, FolderOpen, SearchX, NotebookPen } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface EmptyFolderProps {
  isRoot: boolean;
  canCreate: boolean;
  onUpload: () => void;
  onCreateFolder: () => void;
  /** Xenaxio step 115: "Neue Notiz" with its label (the app's own strings). */
  onNewNote?: () => void;
  newNoteLabel?: string;
}

/** What an empty folder shows: what to do next, and that dropping files works. */
export function EmptyFolder({ isRoot, canCreate, onUpload, onCreateFolder, onNewNote, newNoteLabel }: EmptyFolderProps) {
  const t = useTranslations("files");
  // Both open a picker or a dialog, so they end in "…" as the menus' entries do.
  const tMenu = useTranslations("menuAudit");
  return (
    <EmptyState
      className="h-full"
      icon={isRoot ? Upload : FolderOpen}
      title={isRoot ? t("empty_state_title") : t("empty_folder_title")}
      description={canCreate ? t("empty_folder_description") : t("empty_folder_read_only")}
      actions={canCreate ? (
        <>
          <Button size="sm" onClick={onUpload} className="gap-1.5">
            <Upload className="w-4 h-4" />
            {tMenu("files_upload_files")}
          </Button>
          <Button variant="outline" size="sm" onClick={onCreateFolder} className="gap-1.5">
            <FolderPlus className="w-4 h-4" />
            {tMenu("files_new_folder")}
          </Button>
          {/* Xenaxio step 115: a note can be started right here. */}
          {onNewNote && (
            <Button variant="outline" size="sm" onClick={onNewNote} className="gap-1.5">
              <NotebookPen className="w-4 h-4" />
              {newNoteLabel}
            </Button>
          )}
        </>
      ) : undefined}
    />
  );
}

export function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  const t = useTranslations("files");
  return (
    <EmptyState
      className="h-full"
      icon={SearchX}
      title={t("no_results_for", { query })}
      actions={<Button variant="outline" size="sm" onClick={onClear}>{t("clear_search")}</Button>}
    />
  );
}
