// Step 104: sending a profile picture or the own banner, still or moving.
// The still picture always goes first (lists, mail and calendar show it); a
// moving one (GIF, animated WebP) then goes up as it is, with the part shown.
import { type AvatarAnimation, type AvatarTarget, type BannerImage, XenaxioApiError, xenaxio } from "@/lib/xenaxio/api";
import { cutPicture, type Focus, isAnimated } from "@/lib/xenaxio/media";

export const AVATAR_STILL_SIDE = 256;
export const AVATAR_STILL_MAX_BYTES = 256 * 1024;
export const AVATAR_ANIMATED_MAX_BYTES = 2 * 1024 * 1024;
/** The banner strip: 3:1, as the profile card shows it. */
export const BANNER_ASPECT = 3;
export const BANNER_STILL = { width: 1500, height: 500 };
export const BANNER_STILL_MAX_BYTES = 512 * 1024;
export const BANNER_ANIMATED_MAX_BYTES = 5 * 1024 * 1024;

/** Too large before anything is sent (a moving picture is not made smaller here). */
function checkSize(file: Blob, animated: boolean, max: number, code: "avatar_too_large" | "banner_too_large") {
  if (animated && file.size > max) throw new XenaxioApiError(413, code, { maxBytes: max });
}

export async function sendAvatar(target: AvatarTarget, file: Blob, focus: Focus): Promise<{ avatarUrl: string; animation: AvatarAnimation | null }> {
  const animated = await isAnimated(file);
  checkSize(file, animated, AVATAR_ANIMATED_MAX_BYTES, "avatar_too_large");
  const still = await cutPicture(file, AVATAR_STILL_SIDE, AVATAR_STILL_SIDE, focus, AVATAR_STILL_MAX_BYTES);
  const { avatarUrl } = await xenaxio.uploadAvatar(target, still);
  if (!animated) return { avatarUrl, animation: null };
  const { animation } = await xenaxio.uploadAvatarAnimation(target, file, focus);
  return { avatarUrl, animation };
}

export async function sendBanner(file: Blob, focus: Focus): Promise<BannerImage> {
  const animated = await isAnimated(file);
  checkSize(file, animated, BANNER_ANIMATED_MAX_BYTES, "banner_too_large");
  const still = await cutPicture(file, BANNER_STILL.width, BANNER_STILL.height, focus, BANNER_STILL_MAX_BYTES);
  const { bannerImage } = await xenaxio.uploadBanner(still);
  if (!animated) return bannerImage;
  return (await xenaxio.uploadBannerAnimation(file, focus)).bannerImage;
}
