// Step 114: two columns side by side with a divider (a Rooms thread, the
// Details panel of Files). The right column's share of the area in percent,
// within 20–80 % and leaving both columns at least 280 px.

export const SPLIT_DEFAULT = 50;
export const SPLIT_MIN = 20;
export const SPLIT_MAX = 80;
/** Neither column gets narrower than this. */
export const SPLIT_COLUMN_MIN_PX = 280;

export function clampSplit(percent: number, areaPx?: number): number {
  let low: number = SPLIT_MIN;
  let high: number = SPLIT_MAX;
  if (areaPx && areaPx > 2 * SPLIT_COLUMN_MIN_PX) {
    const min = (SPLIT_COLUMN_MIN_PX / areaPx) * 100;
    low = Math.max(low, min);
    high = Math.min(high, 100 - min);
  }
  return Math.round(Math.min(high, Math.max(low, percent)) * 10) / 10;
}

/** A saved share: a number within 20–80, anything else is none. */
export function splitOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(clampSplit(value)) : null;
}

/** The right column's style while the divider is shown. */
export function splitStyle(percent: number): { width: string; minWidth: number; maxWidth: string } {
  return { width: `${percent}%`, minWidth: SPLIT_COLUMN_MIN_PX, maxWidth: `calc(100% - ${SPLIT_COLUMN_MIN_PX}px)` };
}
