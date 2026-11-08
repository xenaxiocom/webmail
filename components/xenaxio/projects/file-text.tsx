"use client";

// xenaxio step 133: pictures and files in comments and descriptions of tasks and
// records. A picture pasted from the clipboard, a dropped file or one chosen with the
// paper clip goes into the task's or record's files (step 127 A); the text gets a
// reference to it where the caret is, as GitHub does ("![name](file:<id>)"), and the
// comment or description shows the picture or a chip to download the file.
import { type ClipboardEvent, type DragEvent, Fragment, type ReactNode, type RefObject, useRef, useState } from "react";
import { Paperclip } from "@/components/icons";
import { errorText } from "@/lib/xenaxio/api";
import { useXT } from "@/lib/xenaxio/i18n";
import { fileRef, insertSnippet, splitFileRefs } from "@/lib/xenaxio/object-file-refs";
import { pastedFiles, pastedName } from "@/lib/xenaxio/paste";
import { objectFileUrl, uploadObjectFile } from "@/lib/xenaxio/projects";
import { toast } from "@/stores/toast-store";

const MAX_BYTES = 50 * 1024 * 1024;

export interface FileTarget {
  objectId: string;
  /** The task whose files they become; none: the record's own files. */
  taskId?: string | null;
  /** After a file was added (the "Files" block reloads). */
  onUploaded?: () => void;
}

/**
 * Paste, drop and paper clip for a text field. `files` undefined: the field takes no
 * files (no rights, or the record's type has no files).
 */
export function useFileText({ field, files, value, onChange }: { field: RefObject<HTMLTextAreaElement | HTMLInputElement | null>; files?: FileTarget; value: string; onChange: (next: string) => void }) {
  const t = useXT();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const current = useRef(value);
  current.current = value;

  const upload = async (list: File[]) => {
    if (!files || list.length === 0) return;
    const el = field.current;
    let start = el?.selectionStart ?? current.current.length;
    let end = el?.selectionEnd ?? start;
    let added = false;
    for (const raw of list) {
      if (raw.size > MAX_BYTES) {
        toast.error(t("errors.object_file_too_large"));
        continue;
      }
      const file = new File([raw], pastedName(raw), { type: raw.type });
      setBusy(file.name);
      try {
        const saved = await uploadObjectFile(files.objectId, file, files.taskId);
        const next = insertSnippet(current.current, start, end, fileRef(saved));
        current.current = next.text;
        start = end = next.caret;
        onChange(next.text);
        added = true;
      } catch (err) {
        toast.error(errorText(t, err));
      }
    }
    setBusy(null);
    if (!added) return;
    files.onUploaded?.();
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start, start);
    });
  };

  const fieldProps = files
    ? {
        onPaste: (e: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          const list = pastedFiles(e.clipboardData);
          if (list.length === 0) return;
          e.preventDefault();
          void upload(list);
        },
        onDrop: (e: DragEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          if (e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          void upload([...e.dataTransfer.files]);
        },
        onDragOver: (e: DragEvent<HTMLTextAreaElement | HTMLInputElement>) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        },
      }
    : {};

  const attach = files ? (
    <>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
        onClick={() => picker.current?.click()}
        disabled={busy !== null}
        title={t("projects.attach_hint")}
      >
        <Paperclip className="h-4 w-4" />
        <span>{busy ? t("projects.files_uploading", { name: busy }) : t("projects.attach")}</span>
      </button>
      <input
        ref={picker}
        type="file"
        multiple
        className="hidden"
        aria-label={t("projects.files_add")}
        onChange={(e) => {
          const list = e.target.files ? [...e.target.files] : [];
          e.target.value = "";
          void upload(list);
        }}
      />
    </>
  ) : null;

  return { fieldProps, attach, busy };
}

/**
 * A comment with the files it points to: pictures shown (opening full size), other
 * files as a chip that downloads; `text` shows the words between (e.g. with @mentions).
 */
export function FileText({ body, objectId, text: show }: { body: string; objectId: string; text?: (text: string) => ReactNode }) {
  const parts = splitFileRefs(body);
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "text") {
          // The line breaks around a picture are its own line, not empty lines.
          let text = p.text;
          if (parts[i - 1]?.kind === "file" && (parts[i - 1] as { picture: boolean }).picture) text = text.replace(/^\r?\n/, "");
          if (parts[i + 1]?.kind === "file" && (parts[i + 1] as { picture: boolean }).picture) text = text.replace(/\r?\n$/, "");
          return <Fragment key={i}>{show ? show(text) : text}</Fragment>;
        }
        return p.picture ? (
          <a key={i} href={objectFileUrl(objectId, p.id, true)} target="_blank" rel="noopener noreferrer" className="my-1 block w-fit" title={p.name}>
            <img src={objectFileUrl(objectId, p.id, true)} alt={p.name} loading="lazy" className="max-h-60 max-w-full rounded-md border border-border" />
          </a>
        ) : (
          <a key={i} href={objectFileUrl(objectId, p.id)} download={p.name} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 align-middle text-xs hover:underline">
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="truncate">{p.name}</span>
          </a>
        );
      })}
    </>
  );
}
