"use client";

// Step 99, part E: a link's preview under the message, as in Slack — site,
// title, description and picture. The platform fetches the page and the
// picture; nothing loads from the other site in the browser.
import { useEffect, useState } from "react";
import { type LinkPreview, linkPreview, previewImageUrl } from "@/lib/xenaxio/chat/api";

export function LinkPreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [imageOk, setImageOk] = useState(true);
  useEffect(() => {
    let live = true;
    void linkPreview(url).then((p) => live && setPreview(p));
    return () => {
      live = false;
    };
  }, [url]);
  if (!preview) return null;
  let host = "";
  try {
    host = new URL(preview.url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-testid="chat-link-preview"
      className="mt-1 flex max-w-xl gap-3 rounded-md border-l-4 border-border bg-muted/30 py-1.5 pl-3 pr-2 hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-muted-foreground">{preview.siteName ?? host}</span>
        {preview.title && <span className="block font-semibold text-primary">{preview.title}</span>}
        {preview.description && <span className="line-clamp-2 block text-sm text-foreground/80">{preview.description}</span>}
      </span>
      {preview.image && imageOk && (
        <img src={previewImageUrl(preview.image)} alt="" loading="lazy" onError={() => setImageOk(false)} className="h-16 w-16 shrink-0 rounded object-cover sm:h-20 sm:w-20" />
      )}
    </a>
  );
}
