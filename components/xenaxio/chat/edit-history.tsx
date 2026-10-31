"use client";

// Step 99, part E: the earlier versions of an edited message ("bearbeitet").
import { useEffect, useState } from "react";
import type { ChatClient, Message } from "@/lib/xenaxio/chat/client";
import { messageHtml } from "@/lib/xenaxio/chat/format";
import { useXT } from "@/lib/xenaxio/i18n";
import { useChatTime } from "./common";
import { RichHtml } from "./code";
import { Modal } from "./dialogs";

export function EditHistory({ client, message, onClose }: { client: ChatClient; message: Message; onClose: () => void }) {
  const t = useXT();
  const { full } = useChatTime();
  const [versions, setVersions] = useState<{ ts: number; body: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    client
      .editHistory(message.roomId, message.id)
      .then((v) => live && setVersions(v))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [client, message.roomId, message.id]);
  return (
    <Modal title={t("chat.edit_history")} onClose={onClose} wide>
      {failed && <p className="text-sm text-muted-foreground">{t("chat.error")}</p>}
      {!versions && !failed && <p className="text-sm text-muted-foreground">{t("chat.loading")}</p>}
      {versions && (
        <ol className="max-h-[60vh] space-y-3 overflow-y-auto">
          {[...versions].reverse().map((v, i) => (
            <li key={`${v.ts}-${i}`} className="rounded-md border border-border p-3">
              <div className="mb-1 text-xs text-muted-foreground">
                {i === 0 ? t("chat.edit_history_now") : i === versions.length - 1 ? t("chat.edit_history_original") : t("chat.edit_history_version")} · {full(v.ts)}
              </div>
              <div className="text-sm">
                <RichHtml html={messageHtml({ body: v.body })} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
