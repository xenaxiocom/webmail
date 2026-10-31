// Step 99, part E2b: polls in Rooms (Discord and Slack apps have them). Matrix
// polls as Element writes them (MSC3381, still under the unstable names), so
// people in Element vote in the same poll.
export const POLL_START = "org.matrix.msc3381.poll.start";
export const POLL_RESPONSE = "org.matrix.msc3381.poll.response";
export const POLL_END = "org.matrix.msc3381.poll.end";
const STABLE = { start: "m.poll.start", response: "m.poll.response", end: "m.poll.end" };
const TEXT = "org.matrix.msc1767.text";
const DISCLOSED = "org.matrix.msc3381.poll.disclosed";
const UNDISCLOSED = "org.matrix.msc3381.poll.undisclosed";

export const isPollStart = (type: string) => type === POLL_START || type === STABLE.start;
export const isPollResponse = (type: string) => type === POLL_RESPONSE || type === STABLE.response;
export const isPollEnd = (type: string) => type === POLL_END || type === STABLE.end;

export const MAX_ANSWERS = 20;

export interface Poll {
  question: string;
  answers: { id: string; text: string }[];
  /** How many answers one person may pick. */
  maxSelections: number;
  /** Results only after the poll ends. */
  hidden: boolean;
}

/** Votes and end of a poll, gathered from its responses. */
export interface PollState {
  /** Person → their latest answers (and when). */
  votes: Map<string, { answers: string[]; ts: number }>;
  endedTs: number | null;
}

const text = (v: unknown, max: number): string => {
  if (typeof v === "string") return v.slice(0, max);
  if (v && typeof v === "object") {
    const t = (v as Record<string, unknown>)[TEXT] ?? (v as Record<string, unknown>)["m.text"];
    if (typeof t === "string") return t.slice(0, max);
    // Extensible events: [{ body, mimetype }]
    if (Array.isArray(t)) {
      const plain = t.find((x) => x && typeof x === "object" && typeof (x as { body?: unknown }).body === "string") as { body: string } | undefined;
      if (plain) return plain.body.slice(0, max);
    }
  }
  return "";
};

/** The poll of a start event; other people's fields are checked, never trusted. */
export function pollOf(content: Record<string, unknown>): Poll | null {
  const p = (content[POLL_START] ?? content[STABLE.start]) as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;
  const question = text(p.question, 500);
  const answers = (Array.isArray(p.answers) ? p.answers : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof (a as { id?: unknown }).id === "string")
    .slice(0, MAX_ANSWERS)
    .map((a) => ({ id: String(a.id).slice(0, 64), text: text(a, 300) }))
    .filter((a) => a.id && a.text);
  if (!question || answers.length < 2) return null;
  const max = typeof p.max_selections === "number" && Number.isFinite(p.max_selections) ? Math.max(1, Math.min(answers.length, Math.floor(p.max_selections))) : 1;
  return { question, answers, maxSelections: max, hidden: p.kind === UNDISCLOSED };
}

/** The content of a new poll; a plain text for clients without polls. */
export function pollContent(input: { question: string; answers: string[]; multiple: boolean; hidden: boolean }): Record<string, unknown> {
  const answers = input.answers
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, MAX_ANSWERS)
    .map((a, i) => ({ id: `a${i + 1}`, [TEXT]: a.slice(0, 300) }));
  const question = input.question.trim().slice(0, 500);
  const fallback = `${question}\n${answers.map((a, i) => `${i + 1}. ${a[TEXT]}`).join("\n")}`;
  return {
    [POLL_START]: { question: { [TEXT]: question }, kind: input.hidden ? UNDISCLOSED : DISCLOSED, max_selections: input.multiple ? answers.length : 1, answers },
    [TEXT]: fallback,
  };
}

export function responseContent(pollId: string, answers: string[]): Record<string, unknown> {
  return { "m.relates_to": { rel_type: "m.reference", event_id: pollId }, [POLL_RESPONSE]: { answers } };
}

export function endContent(pollId: string, label: string): Record<string, unknown> {
  return { "m.relates_to": { rel_type: "m.reference", event_id: pollId }, [POLL_END]: {}, [TEXT]: label };
}

/** The answers of a response event that belong to this poll (unknown ones and too many are not counted). */
export function responseAnswers(content: Record<string, unknown>, poll: Poll): string[] | null {
  const r = (content[POLL_RESPONSE] ?? content[STABLE.response]) as { answers?: unknown } | undefined;
  if (!r || !Array.isArray(r.answers)) return null;
  const known = new Set(poll.answers.map((a) => a.id));
  const picked = [...new Set(r.answers.filter((a): a is string => typeof a === "string" && known.has(a)))];
  // Matrix: more than allowed — only the first ones count; none — the vote is taken back.
  return picked.slice(0, poll.maxSelections);
}

/** Counts per answer and who voted; each person once, with their latest answers. */
export function tally(poll: Poll, state: PollState | undefined): { counts: Map<string, number>; voters: number } {
  const counts = new Map(poll.answers.map((a) => [a.id, 0]));
  let voters = 0;
  for (const v of state?.votes.values() ?? []) {
    if (v.answers.length === 0) continue;
    voters++;
    for (const a of v.answers) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return { counts, voters };
}
