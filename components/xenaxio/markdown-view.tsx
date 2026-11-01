"use client";

// Xenaxio step 115: a Markdown note as GitHub shows it. Used by the note
// editor's preview and by the file preview of .md files.
import { useMemo } from "react";
import { renderMarkdown } from "@/lib/xenaxio/markdown";
import { cn } from "@/lib/utils";

const STYLES = [
  "text-sm leading-relaxed break-words text-foreground",
  "[&>*:first-child]:mt-0 [&_p]:my-3",
  "[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:pb-1.5 [&_h1]:border-b [&_h1]:border-border [&_h1]:text-2xl [&_h1]:font-semibold",
  "[&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-border [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold",
  "[&_a[href]]:text-primary [&_a[href]]:underline-offset-2 hover:[&_a[href]]:underline",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_li_ul]:my-1 [&_li_ol]:my-1",
  "[&_li:has(>input[type=checkbox])]:list-none [&_li>input[type=checkbox]]:mr-2 [&_li>input[type=checkbox]]:-ml-5 [&_li>input[type=checkbox]]:align-middle",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-3 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:my-6 [&_hr]:border-border",
  "[&_table]:my-3 [&_table]:block [&_table]:w-max [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse",
  "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-semibold [&_th]:bg-muted/50 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5",
  "[&_kbd]:rounded [&_kbd]:border [&_kbd]:border-border [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-xs",
].join(" ");

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div className={cn(STYLES, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
