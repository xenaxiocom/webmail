// xenaxio, step 61: the floating assistant button can be dragged anywhere.
// Its place is kept by the platform per kind of screen (phone, tablet,
// desktop) as shares of the window, so it stays roughly where it was when the
// window changes size or the phone turns.

export type AssistantDevice = "phone" | "tablet" | "desktop";
/** Where the button's centre is, as shares (0…1) of the window's width and height. */
export interface AssistantSpot {
  x: number;
  y: number;
}
export type AssistantPositions = Partial<Record<AssistantDevice, AssistantSpot>>;

/** The button is 48px; this is half of it. */
export const BUTTON_HALF = 24;
/** A pointer has to move this far before a press becomes a drag. */
export const DRAG_THRESHOLD = 5;

/** Below 768px a phone (bottom navigation), below 1280px a tablet, else a desktop. */
export function deviceFor(width: number): AssistantDevice {
  if (width < 768) return "phone";
  if (width < 1280) return "tablet";
  return "desktop";
}

/** Space kept free at the bottom: the phone's navigation bar, elsewhere a margin. */
export function bottomReserve(device: AssistantDevice): string {
  return device === "phone" ? "6rem" : "0.5rem";
}

const share = (n: number) => Math.min(1, Math.max(0, Math.round(n * 10_000) / 10_000));

/** The spot for a button centre at (x, y) pixels in a window of this size. */
export function spotAt(x: number, y: number, width: number, height: number): AssistantSpot {
  return { x: share(width > 0 ? x / width : 0), y: share(height > 0 ? y / height : 0) };
}

/** Did the pointer move far enough to count as a drag? */
export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD;
}

/**
 * CSS for a fixed button at this spot. `clamp` keeps it inside the window, below
 * the notch and above the phone's navigation, whatever the window size is now.
 */
export function spotStyle(spot: AssistantSpot, device: AssistantDevice): { left: string; top: string } {
  const size = `${BUTTON_HALF * 2}px`;
  return {
    left: `clamp(calc(env(safe-area-inset-left, 0px) + 0.5rem), calc(${spot.x * 100}% - ${BUTTON_HALF}px), calc(100% - ${size} - 0.5rem - env(safe-area-inset-right, 0px)))`,
    top: `clamp(calc(env(safe-area-inset-top, 0px) + 0.5rem), calc(${spot.y * 100}% - ${BUTTON_HALF}px), calc(100% - ${size} - ${bottomReserve(device)} - env(safe-area-inset-bottom, 0px)))`,
  };
}

function isSpot(v: unknown): v is AssistantSpot {
  const s = v as AssistantSpot | null;
  return !!s && typeof s.x === "number" && typeof s.y === "number" && s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1;
}

/** Only well-formed spots of known kinds of screen. */
export function cleanPositions(v: unknown): AssistantPositions {
  const out: AssistantPositions = {};
  if (!v || typeof v !== "object") return out;
  for (const device of ["phone", "tablet", "desktop"] as const) {
    const spot = (v as Record<string, unknown>)[device];
    if (isSpot(spot)) out[device] = { x: spot.x, y: spot.y };
  }
  return out;
}

/** A copy on this device, so the button does not jump while /api/me loads. */
const CACHE_KEY = "xenaxio.assistant-position";

export function readCachedPositions(): AssistantPositions {
  try {
    return cleanPositions(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"));
  } catch {
    return {};
  }
}

export function writeCachedPositions(positions: AssistantPositions): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(positions));
  } catch {
    // Storage blocked: the platform still has it.
  }
}

export function clearCachedPositions(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage blocked: nothing kept.
  }
}
