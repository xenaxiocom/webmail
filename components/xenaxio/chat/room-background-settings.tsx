"use client";

// Step 109: a room's background — in a channel's details (tab "Hintergrund")
// and in a direct conversation (button in its header). For everyone in the
// room: a channel's managers set it themselves and the company's admin through
// the platform; in a direct conversation anyone in it (they all have the same
// rights). The set of step 42, or an own picture: made smaller in the browser
// and kept with the chat's files. Each person also chooses only for themselves
// — the room's, the default look, one of the list — and may hide every background.
import { IconPhotoUp } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { type BackgroundChoice, BackgroundPicker } from "@/components/xenaxio/background-picker";
import { errorText, xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { findBackground, NO_BACKGROUND } from "@/lib/xenaxio/backgrounds";
import { uploadFile } from "@/lib/xenaxio/chat/api";
import type { ChatClient, Room } from "@/lib/xenaxio/chat/client";
import { BACKGROUND_TYPE, DEFAULT_LOOK, FOLLOW_CHANNEL, myChoiceFor, roomBackground, withMyChoice } from "@/lib/xenaxio/chat/room-background";
import { useXT } from "@/lib/xenaxio/i18n";
import { shrinkPicture } from "@/lib/xenaxio/meet-background";
import { toast } from "@/stores/toast-store";
import { useChannelRights } from "./channel-details";
import { Modal } from "./dialogs";

/** The grid's code of the uploaded picture. */
const IMAGE = "image";
/** Pictures people pick: photos from a phone too; GIFs give their first frame. */
const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PICK_BYTES = 30 * 1024 * 1024;
/** Long side of the uploaded picture: sharp on a large screen, a few hundred kilobytes. */
const MAX_SIDE = 2560;

export function RoomBackgroundSettings({ client, room }: { client: ChatClient; room: Room }) {
  const t = useXT();
  const { companyAdmin } = useChannelRights(client, room);
  const direct = client.canSetState(room, BACKGROUND_TYPE);
  const dm = room.kind === "dm";
  // The company's admin manages channels, never direct conversations.
  const viaPlatform = !direct && !dm && companyAdmin;
  const forAll = (direct || viaPlatform) && !room.archived;
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mine = client.roomBackgrounds;
  const current = roomBackground(room);
  const nameOf = (code: string | null) => {
    const bg = findBackground(code);
    return bg ? t(`background.names.${bg.name}`) : null;
  };
  const currentName = room.backgroundImage ? t("chat.background_image") : nameOf(room.background);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      toast.success(t("chat.details_saved"));
    } catch (err) {
      toast.error(err instanceof XenaxioApiError ? errorText(t, err) : t("chat.error"));
    } finally {
      setBusy(false);
    }
  };
  const setForAll = (code: string | null) => {
    if (code === IMAGE) return;
    const background = code === NO_BACKGROUND || code === null ? null : code;
    if (background === room.background && !room.backgroundImage) return;
    void run(() => (direct ? client.setChannelBackground(room.id, { background }) : xenaxio.changeChatChannel(room.id, { background })));
  };
  const upload = (file: File) => {
    if (!PICTURE_TYPES.includes(file.type) || file.size > MAX_PICK_BYTES) {
      toast.error(t("chat.background_image_invalid"));
      return;
    }
    void run(async () => {
      const small = await shrinkPicture(file, MAX_SIDE);
      const image = await uploadFile(small, "background.jpg");
      if (direct) await client.setChannelBackground(room.id, { image });
      else await xenaxio.changeChatChannel(room.id, { backgroundImage: image });
    });
  };
  const saveMine = async (next: typeof mine) => {
    setBusy(true);
    try {
      await client.setRoomBackgrounds(next);
    } catch {
      toast.error(t("chat.error"));
    } finally {
      setBusy(false);
    }
  };

  const allChoices: BackgroundChoice[] = [
    { code: NO_BACKGROUND, label: t("background.none"), bg: null },
    ...(room.backgroundImage && current ? [{ code: IMAGE, label: t("chat.background_image"), bg: current, caption: true }] : []),
  ];
  const myChoices: BackgroundChoice[] = [
    { code: FOLLOW_CHANNEL, label: currentName ? t(dm ? "chat.background_follow_dm_named" : "chat.background_follow_named", { name: currentName }) : t(dm ? "chat.background_follow_dm" : "chat.background_follow"), bg: current, caption: true },
    { code: DEFAULT_LOOK, label: t("chat.background_default"), bg: null },
  ];
  const myChoice = myChoiceFor(mine, room.id);
  return (
    <div className="space-y-6 text-sm">
      {forAll ? (
        <section className="space-y-2">
          <h3 className="font-semibold">{t(dm ? "chat.background_for_dm" : "chat.background_for_all")}</h3>
          <p className="text-muted-foreground">{t(dm ? "chat.background_for_dm_hint" : "chat.background_for_all_hint")}</p>
          <BackgroundPicker value={room.backgroundImage ? IMAGE : (room.background ?? NO_BACKGROUND)} extra={allChoices} disabled={busy} onSelect={setForAll} />
          <input
            ref={fileInput}
            type="file"
            accept={PICTURE_TYPES.join(",")}
            className="hidden"
            data-testid="room-background-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 hover:bg-accent disabled:opacity-60">
            <IconPhotoUp size={16} />
            {t(room.backgroundImage ? "chat.background_image_replace" : "chat.background_image_upload")}
          </button>
          <p className="text-xs text-muted-foreground">{t("chat.background_image_hint")}</p>
        </section>
      ) : (
        <p className="text-muted-foreground">
          {currentName ? t("chat.background_channel_has", { name: currentName }) : t("chat.background_channel_none")} {t("chat.background_who")}
        </p>
      )}
      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">{t("chat.background_mine")}</h3>
        <p className="text-muted-foreground">{t("chat.background_mine_hint")}</p>
        <BackgroundPicker value={myChoice} extra={myChoices} disabled={busy} onSelect={(c) => void saveMine(withMyChoice(mine, room.id, c ?? FOLLOW_CHANNEL))} />
        {mine.hideAll && myChoice === FOLLOW_CHANNEL && <p className="text-xs text-muted-foreground">{t("chat.background_hidden_note")}</p>}
        <label className="flex items-start gap-2 pt-2">
          <input type="checkbox" className="mt-0.5" checked={mine.hideAll} disabled={busy} onChange={(e) => void saveMine({ ...mine, hideAll: e.target.checked })} />
          <span>
            {t("chat.background_hide_all")}
            <span className="block text-xs text-muted-foreground">{t("chat.background_hide_all_hint")}</span>
          </span>
        </label>
      </section>
    </div>
  );
}

/** Step 109: the background of a direct conversation, from the button in its header. */
export function RoomBackgroundDialog({ client, room, onClose }: { client: ChatClient; room: Room; onClose: () => void }) {
  const t = useXT();
  return (
    <Modal title={t("chat.background_dialog_title", { name: client.roomName(room) })} onClose={onClose} wide>
      <RoomBackgroundSettings client={client} room={room} />
    </Modal>
  );
}
