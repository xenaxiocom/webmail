// Step 99, part F: slash commands, as in Slack. "/" at the start of the box
// suggests them; Enter runs one instead of sending the text.

export const COMMANDS = ["rename", "topic", "invite", "leave", "mute", "unmute", "remind", "status", "dnd", "msg", "snippet", "poll", "search", "shrug", "me"] as const;
export type Command = (typeof COMMANDS)[number];

/** A command typed in the box, or null for ordinary text. "/" followed by a space or another "/" is text. */
export function parseSlash(text: string): { command: Command; arg: string } | { unknown: string } | null {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  const name = (m[1] as string).toLowerCase();
  const arg = (m[2] ?? "").trim();
  return (COMMANDS as readonly string[]).includes(name) ? { command: name as Command, arg } : { unknown: name };
}

/** Commands for the suggestion while the first word is being typed. */
export function slashSuggestions(text: string): Command[] {
  const m = /^\/([a-z]{0,12})$/i.exec(text);
  if (!m) return [];
  const q = (m[1] as string).toLowerCase();
  return COMMANDS.filter((c) => c.startsWith(q));
}

/** "/dnd 30m|1h|2h|tomorrow|off" → until when (null: off). */
export function dndUntil(arg: string, now = new Date()): Date | null | undefined {
  const a = arg.trim().toLowerCase();
  if (a === "off" || a === "aus") return null;
  const m = /^(\d{1,3})\s*(m|min|h|std)?$/.exec(a);
  if (m) return new Date(now.getTime() + Number(m[1]) * (m[2]?.startsWith("h") || m[2] === "std" ? 3600_000 : 60_000));
  if (a === "" || a === "1h") return new Date(now.getTime() + 3600_000);
  if (a === "tomorrow" || a === "morgen") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  }
  return undefined;
}

/** "@Anna Schmidt rest" → the person (by the longest matching name) and the rest. */
export function personArg<T extends { displayName: string }>(arg: string, people: T[]): { person: T; rest: string } | null {
  const text = arg.replace(/^@/, "");
  const sorted = [...people].sort((a, b) => b.displayName.length - a.displayName.length);
  for (const p of sorted)
    if (text.toLowerCase().startsWith(p.displayName.toLowerCase()) && (text.length === p.displayName.length || /\s/.test(text[p.displayName.length] ?? "")))
      return { person: p, rest: text.slice(p.displayName.length).trim() };
  return null;
}
