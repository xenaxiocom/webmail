import { describe, expect, it } from "vitest";
import { emoticonsToEmoji, isJumboEmoji, searchEmoji } from "../emoji";
import { textContent } from "../format";
import { suggestionAt } from "../view";

describe("typed emoticons", () => {
  it("turns emoticons into emoji", () => {
    expect(emoticonsToEmoji(":)")).toBe("🙂");
    expect(emoticonsToEmoji("Danke :-) bis morgen ;)")).toBe("Danke 🙂 bis morgen 😉");
    expect(emoticonsToEmoji("super :D, xD und <3!")).toBe("super 😄, 😆 und ❤️!");
    expect(emoticonsToEmoji(":) :)")).toBe("🙂 🙂");
    expect(emoticonsToEmoji("schade :(\nna gut :P")).toBe("schade 🙁\nna gut 😛");
  });

  it("turns :codes: into emoji", () => {
    expect(emoticonsToEmoji("Gute Idee :thumbs: :lachen:")).toBe("Gute Idee 👍 😀");
    expect(emoticonsToEmoji(":unbekannt:")).toBe(":unbekannt:");
  });

  it("leaves what is not an emoticon", () => {
    expect(emoticonsToEmoji("Termin um 10:30")).toBe("Termin um 10:30");
    expect(emoticonsToEmoji("siehe https://example.com/:)")).toBe("siehe https://example.com/:)");
    expect(emoticonsToEmoji("Option B) oder 8) Punkt")).toBe("Option B) oder 8) Punkt");
    expect(emoticonsToEmoji("(Hinweis:)")).toBe("(Hinweis:)");
    expect(emoticonsToEmoji("a:)b")).toBe("a:)b");
  });

  it("leaves code as typed", () => {
    expect(emoticonsToEmoji("`f(:)` aber :)")).toBe("`f(:)` aber 🙂");
    expect(emoticonsToEmoji("```\nif (a :) b\n```\n:)")).toBe("```\nif (a :) b\n```\n🙂");
    expect(emoticonsToEmoji("```x :) y```\n:)")).toBe("```x :) y```\n🙂");
  });

  it("sends the emoji in text and HTML", () => {
    expect(textContent("Danke :)")).toEqual({ msgtype: "m.text", body: "Danke 🙂", "m.mentions": {} });
    expect(textContent("**Danke** :)").formatted_body).toBe("<strong>Danke</strong> 🙂");
  });
});

describe("emoji suggestions", () => {
  it("starts after a colon and two letters", () => {
    expect(suggestionAt("Super :la", 9)).toEqual({ trigger: ":", query: "la", start: 6 });
    expect(suggestionAt(":d", 2)).toBeNull();
    expect(suggestionAt("um 10:30", 8)).toBeNull();
    expect(suggestionAt("Hinweis:ab", 10)).toBeNull();
    expect(suggestionAt(":)", 2)).toBeNull();
  });

  it("finds emoji by German and English words, word starts first", () => {
    expect(searchEmoji("daumen")[0]).toEqual({ emoji: "👍", word: "daumen" });
    expect(searchEmoji("heart").map((e) => e.emoji)).toContain("❤️");
    expect(searchEmoji("lach").map((e) => e.emoji).slice(0, 2)).toEqual(["😀", "😄"]);
    expect(searchEmoji("zzzz")).toEqual([]);
  });
});

describe("large emoji", () => {
  it("shows one to three emoji alone large", () => {
    expect(isJumboEmoji("🙂")).toBe(true);
    expect(isJumboEmoji(" 👍🏽 🎉 ❤️ ")).toBe(true);
    expect(isJumboEmoji("👨‍👩‍👧")).toBe(true);
    expect(isJumboEmoji("🇩🇪")).toBe(true);
  });

  it("keeps text and longer rows normal", () => {
    expect(isJumboEmoji("Danke 🙂")).toBe(false);
    expect(isJumboEmoji("🙂🙂🙂🙂")).toBe(false);
    expect(isJumboEmoji("1")).toBe(false);
    expect(isJumboEmoji("©")).toBe(false);
    expect(isJumboEmoji("")).toBe(false);
  });
});
