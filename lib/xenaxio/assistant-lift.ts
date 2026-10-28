// xenaxio: the floating assistant button sits in the bottom-right corner.
// Elements that keep their own buttons there (the chat composer and its send
// button) register here, and the button moves up above them.

/** CSS variable on <html>: how far from the bottom the assistant button must stay. */
export const ASSISTANT_LIFT_VAR = "--xenaxio-assistant-lift";

/** Width of the corner the button lives in (button 48px + its 16–24px margin, with room to spare). */
const ZONE = 80;
/** Space between the button and the element below it. */
const GAP = 12;

type Box = { top: number; left: number; right: number; height: number };

/** Pixels from the viewport bottom the button needs to clear every box in its corner; 0 if none is there. */
export function liftAbove(boxes: Box[], viewWidth: number, viewHeight: number): number {
  let lift = 0;
  for (const b of boxes) {
    if (b.height <= 0 || b.right <= viewWidth - ZONE || b.left >= viewWidth) continue;
    lift = Math.max(lift, Math.ceil(viewHeight - b.top + GAP));
  }
  return lift;
}

const obstacles = new Set<Element>();
let observer: ResizeObserver | null = null;

function update() {
  const root = document.documentElement;
  const lift = liftAbove(
    [...obstacles].map((el) => el.getBoundingClientRect()),
    window.innerWidth,
    window.innerHeight,
  );
  if (lift > 0) root.style.setProperty(ASSISTANT_LIFT_VAR, `${lift}px`);
  else root.style.removeProperty(ASSISTANT_LIFT_VAR);
}

/** Keeps the assistant button above `el` while it is mounted; returns the cleanup. */
export function avoidAssistantButton(el: Element): () => void {
  if (typeof ResizeObserver === "undefined") return () => undefined;
  if (!observer) {
    observer = new ResizeObserver(update);
    window.addEventListener("resize", update);
  }
  obstacles.add(el);
  observer.observe(el);
  update();
  return () => {
    obstacles.delete(el);
    observer?.unobserve(el);
    if (!obstacles.size) {
      observer?.disconnect();
      observer = null;
      window.removeEventListener("resize", update);
    }
    update();
  };
}
