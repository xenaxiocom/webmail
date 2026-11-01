"use client";

// xenaxio step 117: the camera preview of Settings → Account, loaded only when
// the section shows (LiveKit stays out of the settings' bundle).
import { useEffect, useRef, useState } from "react";
import { usePreviewTracks } from "@livekit/components-react";
import { type LocalVideoTrack, Track } from "livekit-client";
import { Button } from "@/components/ui/button";
import { useXT } from "@/lib/xenaxio/i18n";
import type { MeetBackground } from "@/lib/xenaxio/meet";
import { BackgroundPicker, useBackgroundChoice, useBackgroundEffect } from "./background";
import { useMeetLang } from "./lang";

const NO_TRACKS = { audio: false, video: false } as const;
const CAMERA_ONLY = { audio: false, video: true } as const;

export function Preview({ company }: { company: MeetBackground | null }) {
  const { t } = useMeetLang();
  const tx = useXT();
  const [on, setOn] = useState(false);
  const tracks = usePreviewTracks(on ? CAMERA_ONLY : NO_TRACKS);
  const camera = tracks?.find((tr) => tr.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
  const background = useBackgroundChoice(company);
  const effect = useBackgroundEffect(on ? camera : undefined, background.source);
  const videoEl = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoEl.current;
    if (!el || !camera) return;
    camera.attach(el);
    return () => {
      camera.detach(el);
    };
  }, [camera]);

  return (
    <div className="space-y-3 rounded-xl bg-[#111] p-3 text-white" data-testid="meeting-background-setting">
      <div className="relative aspect-video max-w-md overflow-hidden rounded-lg bg-black">
        {on && camera ? (
          <video ref={videoEl} muted playsInline className="h-full w-full object-cover [transform:scaleX(-1)]" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/60">{on ? t("camera_starting") : t("camera_off")}</div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" className="bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => setOn((o) => !o)}>
        {on ? tx("profile_settings.meeting_background_preview_off") : tx("profile_settings.meeting_background_preview_on")}
      </Button>
      <BackgroundPicker choice={background.choice} onChoose={background.choose} company={company} own={background.own} onOwnFile={background.setOwnFile} effect={effect} />
    </div>
  );
}
