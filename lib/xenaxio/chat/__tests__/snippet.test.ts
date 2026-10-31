import { describe, expect, it } from "vitest";
import { messageHtml, plainPreview, toHtml } from "../format";
import { guessLanguage, highlight, isLongPaste, languageOf, loadHighlighter, MAX_INLINE_BYTES, snippetContent, snippetFileFields, snippetFileName, snippetOf } from "../snippet";

describe("snippets (step 96)", () => {
  it("is a normal Matrix code block with our field, read back the same", () => {
    const content = snippetContent({ title: "nginx.conf", language: "py", code: "if a < b:\n    print('x')\n\n" });
    expect(content).toMatchObject({
      msgtype: "m.text",
      body: "nginx.conf\n```python\nif a < b:\n    print('x')\n```",
      formatted_body: "<p><strong>nginx.conf</strong></p><pre><code class=\"language-python\">if a &lt; b:\n    print(&#39;x&#39;)</code></pre>",
      "com.xenaxio.snippet": { title: "nginx.conf", language: "python", lines: 2 },
    });
    expect(snippetOf(content as Record<string, unknown>)).toEqual({ title: "nginx.conf", language: "python", lines: 2, code: "if a < b:\n    print('x')", url: null });
  });

  it("keeps ``` inside the code and plain text without a language tag", () => {
    const content = snippetContent({ title: "", language: "plaintext", code: "a\n```\nb" }) as Record<string, unknown>;
    expect(content.body).toBe("```\na\n```\nb\n```");
    expect(snippetOf(content)?.code).toBe("a\n```\nb");
  });

  it("too large for one message → null (sent as a file), with fields for the file", () => {
    const code = "x".repeat(MAX_INLINE_BYTES);
    expect(snippetContent({ title: "big", language: "js", code })).toBeNull();
    expect(snippetFileFields({ title: "big", language: "js", code: "a\nb" })).toEqual({ "com.xenaxio.snippet": { title: "big", language: "javascript", lines: 2 } });
    expect(snippetOf({ msgtype: "m.file", body: "big.js", url: "mxc://firma.de/abc", "com.xenaxio.snippet": { title: "big", language: "javascript", lines: 900 } })).toEqual({
      title: "big",
      language: "javascript",
      lines: 900,
      code: null,
      url: "mxc://firma.de/abc",
    });
  });

  it("does not trust other people's fields", () => {
    expect(snippetOf({ msgtype: "m.text", body: "no code", "com.xenaxio.snippet": { title: "x" } })).toBeNull();
    expect(snippetOf({ msgtype: "m.file", url: "https://evil.example/x", "com.xenaxio.snippet": {} })).toBeNull();
    expect(snippetOf({ msgtype: "m.text", body: "```\nok\n```", "com.xenaxio.snippet": { title: 5, language: "<script>" } })).toMatchObject({ title: "", language: "plaintext", code: "ok" });
  });

  it("names files and languages", () => {
    expect(snippetFileName("Fehler: a/b?", "ts")).toBe("Fehler a b.ts");
    expect(snippetFileName("", "x")).toBe("snippet.txt");
    expect(snippetFileName("deploy.sh", "bash")).toBe("deploy.sh");
    expect(languageOf("TSX")).toBe("typescript");
    expect(languageOf("ls")).toBeNull();
  });

  it("offers a snippet for a long paste only", () => {
    expect(isLongPaste("kurz")).toBe(false);
    expect(isLongPaste(Array.from({ length: 31 }, () => "x").join("\n"))).toBe(true);
    expect(isLongPaste("x".repeat(4001))).toBe(true);
  });

  it("shows up in previews by its title", () => {
    expect(plainPreview(snippetContent({ title: "deploy.sh", language: "bash", code: "echo 1" }) as Record<string, unknown>)).toBe("</> deploy.sh");
    expect(plainPreview(snippetContent({ title: "", language: "bash", code: "echo 1" }) as Record<string, unknown>)).toBe("</> Snippet");
  });

  it("highlights known languages and escapes everything else", async () => {
    const hljs = await loadHighlighter();
    expect(highlight(hljs, "const a = 1;", "js")).toContain('<span class="hljs-keyword">const</span>');
    expect(highlight(hljs, "<b>", "plaintext")).toBe("&lt;b&gt;");
    expect(highlight(hljs, "<b>", "unknown")).toBe("&lt;b&gt;");
    expect(guessLanguage(hljs, 'def f(x):\n    return x\n\nimport os\nprint(os.getcwd())\nclass A:\n    pass')).toBe("python");
    expect(guessLanguage(hljs, "Hallo Welt")).toBe("plaintext");
    expect(guessLanguage(hljs, Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n"))).toBe("plaintext");
    expect(guessLanguage(hljs, "Hallo Team,\nbitte schaut euch das an.\nDanke!")).toBe("plaintext");
    expect(guessLanguage(hljs, '{"a": 1, "b": [true, null]}')).toBe("json");
    expect(guessLanguage(hljs, "const a = require('x');\nfunction f(b) { return b + 1; }\nconsole.log(f(a));")).toBe("javascript");
    expect(guessLanguage(hljs, "SELECT id, name FROM users WHERE active = true ORDER BY name;")).toBe("sql");
    expect(guessLanguage(hljs, "#!/bin/bash\nset -e\nfor f in *.txt; do echo $f; done")).toBe("bash");
  });
});

describe("code blocks and links in the composer's Markdown (step 96)", () => {
  it("```language names the language; a word that is no language stays code", () => {
    expect(toHtml("```ts\nlet a: number;\n```")).toBe('<pre><code class="language-typescript">let a: number;</code></pre>');
    expect(toHtml("```ls -la\n```")).toBe("<pre><code>ls -la</code></pre>");
  });

  it("[text](url) becomes a link; other schemes stay text", () => {
    expect(toHtml("siehe [Doku](https://x.de/a_b)")).toBe('siehe <a href="https://x.de/a_b">Doku</a>');
    expect(toHtml("[x](javascript:alert(1))")).toBeNull();
  });

  it("keeps the language class of code and drops other classes", () => {
    const html = messageHtml({ body: "", format: "org.matrix.custom.html", formatted_body: '<pre><code class="language-rust">fn</code></pre><p class="evil">x</p><code class="hljs evil">y</code>' });
    expect(html).toContain('<code class="language-rust">fn</code>');
    expect(html).not.toContain("evil");
  });
});
