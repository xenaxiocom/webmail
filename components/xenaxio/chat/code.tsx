"use client";

// Step 98, part A: code in messages, as in Slack — code blocks highlighted
// with a "copy" button, and snippets as a card: title, language, line
// numbers, the first lines until "show all", copy, download, full screen.
import { IconCheck, IconCopy, IconDownload, IconMaximize, IconPencil } from "@tabler/icons-react";
import type { HLJSApi } from "highlight.js";
import { Fragment, useEffect, useMemo, useState } from "react";
import { mediaUrl } from "@/lib/xenaxio/chat/api";
import { highlight, LANGUAGES, languageOf, loadHighlighter, PREVIEW_LINES, type Snippet, snippetFileName } from "@/lib/xenaxio/chat/snippet";
import { useXT } from "@/lib/xenaxio/i18n";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";
import { Modal } from "./dialogs";

/** highlight.js, loaded with the first code on the screen. */
export function useHighlighter(wanted = true): HLJSApi | null {
  const [hljs, setHljs] = useState<HLJSApi | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void loadHighlighter()
      .then((h) => live && setHljs(h))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [wanted]);
  return hljs;
}

function CopyButton({ text, label }: { text: string; label?: boolean }) {
  const t = useXT();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(id);
  }, [done]);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => setDone(true))
          .catch(() => toast.error(t("chat.error")))
      }
      className="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      title={t("chat.code_copy")}
      aria-label={t("chat.code_copy")}
    >
      {done ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {label && <span>{done ? t("chat.copied") : t("chat.code_copy")}</span>}
    </button>
  );
}

/** Lines of code, highlighted when the highlighter is there; optionally numbered. */
function CodeLines({ code, language, numbers, hljs }: { code: string; language: string | null; numbers?: boolean; hljs: HLJSApi | null }) {
  const html = useMemo(() => (hljs ? highlight(hljs, code, language) : null), [hljs, code, language]);
  if (!numbers) {
    return html !== null ? <code className="xen-code block whitespace-pre" dangerouslySetInnerHTML={{ __html: html }} /> : <code className="block whitespace-pre">{code}</code>;
  }
  const count = code.split("\n").length;
  return (
    <div className="flex">
      <div aria-hidden className="select-none pr-3 text-right text-muted-foreground/70 tabular-nums">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {html !== null ? <code className="xen-code block min-w-0 flex-1 whitespace-pre" dangerouslySetInnerHTML={{ __html: html }} /> : <code className="block min-w-0 flex-1 whitespace-pre">{code}</code>}
    </div>
  );
}

/** A ``` block of a message. */
export function CodeBlock({ code, language }: { code: string; language: string | null }) {
  const hljs = useHighlighter(!!languageOf(language) && languageOf(language) !== "plaintext");
  return (
    <div className="group/code relative my-1 rounded-md bg-muted">
      <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover/code:opacity-100 [@media(hover:none)]:opacity-100">
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-2 pr-9 font-mono text-[0.85em] leading-relaxed">
        <CodeLines code={code} language={language} hljs={hljs} />
      </pre>
    </div>
  );
}

/**
 * Safe message HTML with its top-level `<pre>` blocks as CodeBlocks. The
 * HTML is already sanitized; the pieces between the blocks stay as they are.
 */
export function RichHtml({ html }: { html: string }) {
  const parts = useMemo(() => {
    if (!html.includes("<pre")) return null;
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return null;
    const out: ({ kind: "html"; html: string } | { kind: "code"; code: string; language: string | null })[] = [];
    let chunk = "";
    for (const node of [...root.childNodes]) {
      if (node.nodeType === 1 && (node as Element).tagName === "PRE") {
        if (chunk) out.push({ kind: "html", html: chunk });
        chunk = "";
        const el = node as Element;
        const code = el.querySelector("code");
        const lang = /^language-(.+)$/.exec(code?.getAttribute("class") ?? "")?.[1] ?? null;
        out.push({ kind: "code", code: (code ?? el).textContent ?? "", language: lang });
      } else {
        chunk += node.nodeType === 1 ? (node as Element).outerHTML : node.nodeType === 3 ? escapeText(node.textContent ?? "") : "";
      }
    }
    if (chunk) out.push({ kind: "html", html: chunk });
    return out;
  }, [html]);
  if (!parts) return <span dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "code" ? (
          <CodeBlock key={i} code={p.code} language={p.language} />
        ) : (
          <Fragment key={i}>
            {/* A <br> right after a block would add an empty line. */}
            <span dangerouslySetInnerHTML={{ __html: i > 0 ? p.html.replace(/^<br>/, "") : p.html }} />
          </Fragment>
        ),
      )}
    </>
  );
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The text of a snippet: in the message, or loaded from its file. */
function useSnippetCode(snippet: Snippet): { code: string | null; failed: boolean } {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (snippet.code !== null || !snippet.url) return;
    const url = mediaUrl(snippet.url);
    if (!url) return;
    let live = true;
    fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => live && setLoaded(text))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [snippet.code, snippet.url]);
  return { code: snippet.code ?? loaded, failed };
}

export function SnippetCard({ snippet, onEdit }: { snippet: Snippet; onEdit?: () => void }) {
  const t = useXT();
  const { code, failed } = useSnippetCode(snippet);
  const [all, setAll] = useState(false);
  const [full, setFull] = useState(false);
  const hljs = useHighlighter(snippet.language !== "plaintext");
  const lines = code !== null ? code.split("\n").length : snippet.lines;
  const shown = code === null ? null : all || lines <= PREVIEW_LINES ? code : code.split("\n").slice(0, PREVIEW_LINES).join("\n");
  const title = snippet.title || t("chat.snippet");
  const language = LANGUAGES[snippet.language]?.name ?? snippet.language;
  const download = () => {
    if (code === null) return;
    const href = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = snippetFileName(snippet.title, snippet.language);
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  const tool = "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <div className="mt-1 max-w-3xl overflow-hidden rounded-md border border-border" data-testid="chat-snippet">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{"</>"}</span>
        <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {language} · {t("chat.snippet_lines", { count: lines })}
        </span>
        <span className="flex-1" />
        {onEdit && (
          <button type="button" className={tool} onClick={onEdit} title={t("chat.edit")} aria-label={t("chat.edit")}>
            <IconPencil size={14} />
          </button>
        )}
        {code !== null && <CopyButton text={code} />}
        <button type="button" className={tool} onClick={download} disabled={code === null} title={t("chat.download")} aria-label={t("chat.download")}>
          <IconDownload size={14} />
        </button>
        <button type="button" className={tool} onClick={() => setFull(true)} disabled={code === null} title={t("chat.snippet_full")} aria-label={t("chat.snippet_full")}>
          <IconMaximize size={14} />
        </button>
      </div>
      {shown === null ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">{failed ? t("chat.error") : t("chat.loading")}</div>
      ) : (
        <pre className="max-h-[480px] overflow-auto p-2 font-mono text-[0.85em] leading-relaxed">
          <CodeLines code={shown} language={snippet.language} numbers hljs={hljs} />
        </pre>
      )}
      {code !== null && lines > PREVIEW_LINES && (
        <button type="button" onClick={() => setAll((a) => !a)} className={cn("block w-full border-t border-border px-3 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent")}>
          {all ? t("chat.snippet_less") : t("chat.snippet_all", { count: lines })}
        </button>
      )}
      {full && code !== null && (
        <Modal title={title} onClose={() => setFull(false)} size="full">
          <pre className="max-h-[75vh] overflow-auto rounded-md bg-muted p-3 font-mono text-sm leading-relaxed">
            <CodeLines code={code} language={snippet.language} numbers hljs={hljs} />
          </pre>
        </Modal>
      )}
    </div>
  );
}
