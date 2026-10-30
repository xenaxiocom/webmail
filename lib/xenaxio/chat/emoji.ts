// Step 87: emoji in Rooms. The curated set of the picker (German and English
// search words), typed emoticons and :codes: turned into emoji, and messages
// of a few emoji alone shown large.

export type EmojiEntry = [emoji: string, words: string];

/** Common emoji with search words (German and English). */
export const EMOJI_CATEGORIES: { key: string; items: EmojiEntry[] }[] = [
  {
    key: "smileys",
    items: [
      ["😀", "grinsen grin lachen smile"], ["😄", "lachen laugh freude happy"], ["😂", "tränen lachen joy tears"], ["🙂", "lächeln slight smile"], ["😉", "zwinkern wink"],
      ["😊", "erröten blush"], ["😍", "verliebt love heart eyes"], ["🤩", "begeistert star struck"], ["😎", "cool sonnenbrille sunglasses"], ["🤔", "nachdenken thinking hmm"],
      ["😅", "schwitzen sweat smile puh"], ["😬", "grimasse grimace oops"], ["🙃", "kopfüber upside down"], ["😴", "schlafen sleep müde"], ["😮", "überrascht wow surprised"],
      ["😢", "traurig weinen sad cry"], ["😭", "heulen sob"], ["😡", "wütend angry"], ["🤯", "explodiert mind blown"], ["🥳", "party feiern celebrate"],
      ["🤗", "umarmen hug"], ["🙈", "affe nicht sehen see no evil"], ["😇", "engel innocent"], ["🤝", "handschlag deal handshake"], ["🫡", "salut salute"],
    ],
  },
  {
    key: "people",
    items: [
      ["👍", "daumen hoch ja gut thumbs up yes ok"], ["👎", "daumen runter nein thumbs down no"], ["👏", "klatschen applaus clap"], ["🙌", "hurra hände raise hands"], ["🙏", "danke bitte thanks please pray"],
      ["💪", "stark muskel strong"], ["👀", "augen schauen eyes look"], ["👋", "winken hallo wave hello"], ["✌️", "frieden victory peace"], ["🤞", "daumen drücken fingers crossed"],
      ["👌", "ok perfekt perfect"], ["🫶", "herz hände heart hands"], ["🤷", "keine ahnung shrug"], ["🙋", "melden hand raise"], ["💁", "info"],
    ],
  },
  {
    key: "nature",
    items: [
      ["🔥", "feuer fire heiß hot lit"], ["⭐", "stern star"], ["🌟", "glänzen glowing star"], ["☀️", "sonne sun"], ["🌈", "regenbogen rainbow"],
      ["🌧️", "regen rain"], ["❄️", "schnee snow"], ["🌱", "pflanze plant wachsen"], ["🌸", "blüte blossom"], ["🐶", "hund dog"], ["🐱", "katze cat"], ["🦄", "einhorn unicorn"],
    ],
  },
  {
    key: "objects",
    items: [
      ["🎉", "party konfetti tada celebrate"], ["🎂", "kuchen geburtstag birthday cake"], ["☕", "kaffee coffee"], ["🍕", "pizza"], ["🍺", "bier beer"],
      ["🚀", "rakete rocket launch"], ["💡", "idee idea glühbirne"], ["📅", "kalender termin calendar"], ["📎", "büroklammer paperclip"], ["📌", "pin anheften"],
      ["📈", "wachstum chart up"], ["📉", "rückgang chart down"], ["💰", "geld money"], ["🧾", "rechnung receipt invoice"], ["💻", "laptop computer"],
      ["📞", "telefon phone call"], ["✉️", "brief mail email"], ["🔒", "schloss lock"], ["🛠️", "werkzeug tools"], ["🏆", "pokal trophy win"],
    ],
  },
  {
    key: "symbols",
    items: [
      ["❤️", "herz liebe heart love"], ["💙", "blaues herz blue heart"], ["💚", "grünes herz green heart"], ["✅", "erledigt done check ok"], ["☑️", "abgehakt check box"],
      ["❌", "nein falsch no cross"], ["⚠️", "achtung warnung warning"], ["❗", "wichtig ausrufezeichen important"], ["❓", "frage question"], ["💯", "hundert perfekt hundred"],
      ["➕", "plus"], ["🔴", "rot red"], ["🟡", "gelb yellow"], ["🟢", "grün green"], ["⏳", "warten sanduhr wait"], ["🔁", "wiederholen repeat"],
    ],
  },
];

/** ":lachen:" and ":smile:" → the first emoji that has the word. */
const SHORTCODES = new Map<string, string>();
for (const [emoji, words] of EMOJI_CATEGORIES.flatMap((c) => c.items)) for (const w of words.split(" ")) if (!SHORTCODES.has(w)) SHORTCODES.set(w, emoji);

/** Emoji whose words start with (or contain) the query, best first; for the composer's ":" suggestions. */
export function searchEmoji(query: string, limit = 8): { emoji: string; word: string }[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const all = EMOJI_CATEGORIES.flatMap((c) => c.items);
  const starts: { emoji: string; word: string }[] = [];
  const contains: { emoji: string; word: string }[] = [];
  for (const [emoji, words] of all) {
    const list = words.split(" ");
    const hit = list.find((w) => w.startsWith(q));
    if (hit) starts.push({ emoji, word: hit });
    else {
      const inner = list.find((w) => w.includes(q));
      if (inner) contains.push({ emoji, word: inner });
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Typed emoticons, as Slack and WhatsApp turn them into emoji. Only whole words: "8)" in lists and "B)" in options stay. */
const EMOTICONS: Record<string, string> = {
  ":)": "🙂", ":-)": "🙂", "=)": "🙂",
  ":D": "😄", ":-D": "😄", "=D": "😄",
  xD: "😆", XD: "😆",
  ";)": "😉", ";-)": "😉",
  ":(": "🙁", ":-(": "🙁",
  ":'(": "😢", ":'-(": "😢",
  ":P": "😛", ":-P": "😛", ":p": "😛", ":-p": "😛",
  ":O": "😮", ":-O": "😮", ":o": "😮", ":-o": "😮",
  ":*": "😘", ":-*": "😘",
  ":|": "😐", ":-|": "😐",
  ":/": "😕", ":-/": "😕",
  "B-)": "😎",
  "<3": "❤️", "</3": "💔",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EMOTICON_RE = new RegExp(
  `(^|\\s)(${Object.keys(EMOTICONS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|")}|:[a-zäöüß]+:)(?=$|\\s|[.,!?])`,
  "g",
);

function replaceWords(text: string): string {
  return text.replace(EMOTICON_RE, (all, space: string, word: string) => {
    const emoji = EMOTICONS[word] ?? (word.startsWith(":") && word.length > 2 ? SHORTCODES.get(word.slice(1, -1)) : undefined);
    return emoji ? space + emoji : all;
  });
}

/** The composer's text with emoticons and :codes: as emoji; code spans and blocks stay as typed. */
export function emoticonsToEmoji(text: string): string {
  let fence = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) {
        // A one-line block (```x```) opens and closes on the same line.
        const rest = line.trim().slice(3);
        if (!(rest.endsWith("```") && rest.length > 3)) fence = !fence;
        return line;
      }
      if (fence) return line;
      return line
        .split(/(`[^`]+`)/g)
        .map((part) => (/^`[^`]+`$/.test(part) ? part : replaceWords(part)))
        .join("");
    })
    .join("\n");
}

/** One emoji: a pictograph with skin tone, variation selector and joined parts, a flag, or a keycap. */
const ONE_EMOJI = String.raw`(?:\p{Regional_Indicator}{2}|[0-9#*]️?⃣|\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?(?:‍\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?)*)`;
const EMOJI_ONLY_RE = new RegExp(String.raw`^\s*(?:${ONE_EMOJI}\s*){1,3}$`, "u");

/** A message of one to three emoji and nothing else is shown large, as in WhatsApp. */
export function isJumboEmoji(text: string): boolean {
  // "©" and "™" are pictographs too, but they are text.
  return EMOJI_ONLY_RE.test(text) && !/^[\s©®™‼⁉]*$/u.test(text.replace(/️/g, ""));
}
