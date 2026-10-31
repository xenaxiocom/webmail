import { describe, expect, it } from "vitest";
import { appOf, chatLinkTarget, emailShareContent, messageHtml, mentionsUser, plainPreview, sharedEmailOf, textContent, toHtml } from "../format";

describe("composer text → message", () => {
  it("sends plain text without HTML", () => {
    expect(textContent("Hallo zusammen")).toEqual({ msgtype: "m.text", body: "Hallo zusammen", "m.mentions": {} });
  });

  it("formats Slack-style Markdown", () => {
    expect(toHtml("**fett** und _kursiv_ und ~~weg~~ und `code`")).toBe("<strong>fett</strong> und <em>kursiv</em> und <del>weg</del> und <code>code</code>");
    expect(toHtml("```\nconst a = 1 < 2;\n```")).toBe("<pre><code>const a = 1 &lt; 2;</code></pre>");
    expect(toHtml("> zitiert\n> zwei")).toBe("<blockquote>zitiert<br>zwei</blockquote>");
    expect(toHtml("- eins\n- zwei")).toBe("<ul><li>eins</li><li>zwei</li></ul>");
    expect(toHtml("1. eins\n2. zwei")).toBe("<ol><li>eins</li><li>zwei</li></ol>");
    expect(toHtml("siehe https://example.com/a_b_c.")).toBe('siehe <a href="https://example.com/a_b_c">https://example.com/a_b_c</a>.');
  });

  it("escapes HTML the user typed", () => {
    expect(toHtml("<b>nein</b> **ja**")).toBe("&lt;b&gt;nein&lt;/b&gt; <strong>ja</strong>");
  });

  it("links mentions and tells the server who is meant", () => {
    const c = textContent("@Anna Schmidt bitte ansehen, @channel", [{ userId: "@anna:acme.de", displayName: "Anna Schmidt" }, { userId: "@tom:acme.de", displayName: "Tom" }]);
    expect(c.formatted_body).toBe('<a href="https://matrix.to/#/%40anna%3Aacme.de">@Anna Schmidt</a> bitte ansehen, @channel');
    expect(c["m.mentions"]).toEqual({ user_ids: ["@anna:acme.de"], room: true });
  });
});

describe("showing messages", () => {
  it("sanitizes colleagues' HTML", () => {
    const html = messageHtml({ body: "x", format: "org.matrix.custom.html", formatted_body: '<b>ok</b><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">link</a>' });
    expect(html).toContain("<b>ok</b>");
    expect(html).not.toMatch(/img|script|javascript|onerror/);
  });

  it("turns mentions into marked spans and opens links safely", () => {
    const html = messageHtml({ body: "x", format: "org.matrix.custom.html", formatted_body: '<a href="https://matrix.to/#/%40anna%3Aacme.de">Anna</a> <a href="https://example.com">e</a>' });
    expect(html).toContain('data-mention="@anna:acme.de"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("escapes and links plain bodies, drops thread fallbacks", () => {
    expect(messageHtml({ body: "<i>a</i>\nhttps://x.de" })).toBe('&lt;i&gt;a&lt;/i&gt;<br><a href="https://x.de" target="_blank" rel="noopener noreferrer nofollow">https://x.de</a>');
    expect(messageHtml({ body: "x", format: "org.matrix.custom.html", formatted_body: "<mx-reply>old</mx-reply>neu" })).toBe("neu");
  });

  it("knows mentions and previews", () => {
    expect(mentionsUser({ "m.mentions": { user_ids: ["@a:x"] } }, "@a:x")).toBe(true);
    expect(mentionsUser({ "m.mentions": { room: true } }, "@b:x")).toBe(true);
    expect(mentionsUser({ body: "@a" }, "@a:x")).toBe(false);
    expect(plainPreview({ msgtype: "m.image", body: "foto.png" })).toBe("🖼 foto.png");
  });
});

describe("integrations and shared e-mails (step 43, part D)", () => {
  it("labels only integration bots as apps", () => {
    expect(appOf({ "com.xenaxio.webhook": { name: "CI", icon: "🚨" } }, "@xenaxio.hook.0a1b2c3d4e5f:acme.de")).toEqual({ name: "CI", icon: "🚨" });
    expect(appOf({}, "@xenaxio.hook.0a1b2c3d4e5f:acme.de")).toEqual({ name: null, icon: null });
    // A colleague cannot pose as an app by adding the field.
    expect(appOf({ "com.xenaxio.webhook": { name: "Chef" } }, "@anna:acme.de")).toBeNull();
    expect(appOf({ "com.xenaxio.webhook": { icon: "<img src=x>" } }, "@xenaxio.hook.0a:acme.de")?.icon).toBeNull();
  });

  it("builds and reads the e-mail card, checking what others send", () => {
    const content = emailShareContent({ emailId: "Mabc", subject: "Angebot", from: "Max Müller", fromEmail: "max@kunde.de", preview: "Guten   Tag,\n anbei", date: "2026-10-27T09:00:00Z" }, " Bitte prüfen ", "(kein Betreff)");
    expect(content.body).toBe("Bitte prüfen\n\n📧 Angebot — Max Müller <max@kunde.de>\nGuten Tag, anbei");
    expect(sharedEmailOf(content)).toEqual({ emailId: "Mabc", subject: "Angebot", from: "Max Müller", fromEmail: "max@kunde.de", preview: "Guten Tag, anbei", date: "2026-10-27T09:00:00Z", note: "Bitte prüfen" });
    expect(sharedEmailOf({ "com.xenaxio.email": { emailId: "../../admin" } })).toBeNull();
    expect(sharedEmailOf({ "com.xenaxio.email": { emailId: "M1", subject: 5, date: "nope" } })).toMatchObject({ subject: "", date: null });
    expect(sharedEmailOf({ body: "x" })).toBeNull();
  });
});

describe("#channel links (step 99)", () => {
  const channels = [
    { roomId: "!gen:acme.de", name: "general" },
    { roomId: "!dev:acme.de", name: "dev" },
    { roomId: "!devteam:acme.de", name: "dev-team" },
  ];
  const link = (id: string, label: string) => `<a href="https://matrix.to/#/${encodeURIComponent(id)}?via=acme.de">${label}</a>`;

  it("links a known channel as a Matrix permalink", () => {
    const c = textContent("schau in #general vorbei", [], channels);
    expect(c.formatted_body).toBe(`schau in ${link("!gen:acme.de", "#general")} vorbei`);
    expect(c.body).toBe("schau in #general vorbei");
  });

  it("takes the longest name and leaves unknown names, words and addresses alone", () => {
    expect(toHtml("#dev-team und #dev, #devs", [], channels)).toBe(`${link("!devteam:acme.de", "#dev-team")} und ${link("!dev:acme.de", "#dev")}, #devs`);
    expect(toHtml("Issue#general und https://x.de/#general", [], channels)).toBe('Issue#general und <a href="https://x.de/#general">https://x.de/#general</a>');
    expect(toHtml("`#general` **#general**", [], channels)).toBe(`<code>#general</code> <strong>${link("!gen:acme.de", "#general")}</strong>`);
    expect(textContent("nur #random", [], channels).formatted_body).toBeUndefined();
  });

  it("shows a channel link as a channel, not as an outside link", () => {
    const html = messageHtml(textContent("in #general", [], channels));
    expect(html).toContain('data-room="!gen:acme.de"');
    expect(html).toContain('class="chat-channel"');
    expect(html).not.toContain("href=");
    // Other clients link an address (#alias:server).
    expect(messageHtml({ body: "x", format: "org.matrix.custom.html", formatted_body: '<a href="https://matrix.to/#/%23general%3Aacme.de">#general</a>' })).toContain('data-room="#general:acme.de"');
  });

  it("links channels in plain text of other clients and older messages", () => {
    const html = messageHtml({ msgtype: "m.text", body: "siehe #general\nund https://x.de/#dev" }, channels);
    expect(html).toContain('data-room="!gen:acme.de"');
    expect(html).toContain('href="https://x.de/#dev"');
    expect(html).not.toContain('data-room="!dev:acme.de"');
  });

  it("opens links to this chat here", () => {
    const origin = "https://app.acme.de";
    expect(chatLinkTarget(`${origin}/de/chat/?room=${encodeURIComponent("!gen:acme.de")}`, origin)).toEqual({ roomId: "!gen:acme.de", eventId: null });
    expect(chatLinkTarget(`${origin}/de/chat/?room=%21gen%3Aacme.de&event=%24e1`, origin)).toEqual({ roomId: "!gen:acme.de", eventId: "$e1" });
    expect(chatLinkTarget(`https://other.de/de/chat/?room=%21gen%3Aacme.de`, origin)).toBeNull();
    expect(chatLinkTarget(`${origin}/de/chat/?room=%21gen%3Aacme.de&as=u2`, origin)).toBeNull();
    expect(chatLinkTarget(`${origin}/de/mail/?room=%21gen%3Aacme.de`, origin)).toBeNull();
  });
});
