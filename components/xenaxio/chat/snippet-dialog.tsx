"use client";

// Step 99, part A: create or edit a code snippet — title, language
// (guessed when "automatic") and the text with line numbers.
import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { guessLanguage, LANGUAGES, loadHighlighter } from "@/lib/xenaxio/chat/snippet";
import { useXT } from "@/lib/xenaxio/i18n";
import { Modal } from "./dialogs";

export interface SnippetInput {
  title: string;
  language: string;
  code: string;
}

const AUTO = "auto";

export function SnippetDialog({ initial, editing, onClose, onSubmit }: { initial?: Partial<SnippetInput>; editing?: boolean; onClose: () => void; onSubmit: (input: SnippetInput) => Promise<boolean> }) {
  const t = useXT();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [language, setLanguage] = useState(initial?.language ?? AUTO);
  const [code, setCode] = useState(initial?.code ?? "");
  const [busy, setBusy] = useState(false);
  const lines = code ? code.split("\n").length : 1;
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const lang = language === AUTO ? guessLanguage(await loadHighlighter(), code) : language;
      if (await onSubmit({ title, language: lang, code })) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={editing ? t("chat.snippet_edit_title") : t("chat.snippet_title")} onClose={onClose} size="full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1 text-sm font-medium">
          {t("chat.snippet_name")}
          <input
            autoFocus={!initial?.code}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("chat.snippet_name_hint")}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="text-sm font-medium sm:w-56">
          {t("chat.snippet_language")}
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring">
            <option value={AUTO}>{t("chat.snippet_auto")}</option>
            {Object.entries(LANGUAGES).map(([id, l]) => (
              <option key={id} value={id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-sm font-medium" htmlFor="chat-snippet-code">
        {t("chat.snippet_code")}
      </label>
      <div className="mt-1 flex max-h-[55vh] overflow-auto rounded-md border border-input font-mono text-sm leading-6 focus-within:ring-2 focus-within:ring-ring">
        <div aria-hidden className="select-none bg-muted/50 px-2 py-2 text-right text-muted-foreground/70 tabular-nums">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          id="chat-snippet-code"
          autoFocus={!!initial?.code}
          value={code}
          spellCheck={false}
          wrap="off"
          rows={Math.max(8, lines)}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
            // Tab indents instead of leaving the box.
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: s, selectionEnd: end } = el;
              setCode(code.slice(0, s) + "  " + code.slice(end));
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
            }
          }}
          className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-2 py-2 focus:outline-none"
        />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">{t("chat.snippet_send_hint")}</span>
        <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
          {t("chat.cancel")}
        </button>
        <button type="button" onClick={() => void submit()} disabled={!code.trim() || busy} className="flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
          {busy && <IconLoader2 size={14} className="animate-spin" />}
          {editing ? t("chat.save_edit") : t("chat.snippet_send")}
        </button>
      </div>
    </Modal>
  );
}
