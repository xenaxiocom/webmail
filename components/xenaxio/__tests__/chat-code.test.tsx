import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { snippetContent, snippetOf } from "@/lib/xenaxio/chat/snippet";
import { RichHtml, SnippetCard } from "../chat/code";
import { ChatDialogsProvider } from "../chat/dialogs";

describe("code in messages (step 98)", () => {
  it("a ``` block gets highlighting and a copy button; the text around stays", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = render(<RichHtml html={'vorher<br><pre><code class="language-javascript">const a = 1;</code></pre><br>nachher'} />);
    expect(container.textContent).toContain("vorher");
    expect(container.textContent).toContain("nachher");
    await waitFor(() => expect(container.querySelector(".hljs-keyword")?.textContent).toBe("const"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledWith("const a = 1;");
  });

  it("a snippet card shows 10 lines, then all of them; copies the whole code", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const code = Array.from({ length: 25 }, (_, i) => `zeile ${i + 1}`).join("\n");
    const snippet = snippetOf(snippetContent({ title: "log.txt", language: "plaintext", code }) as Record<string, unknown>);
    render(
      <ChatDialogsProvider>
        <SnippetCard snippet={snippet!} />
      </ChatDialogsProvider>,
    );
    const card = screen.getByTestId("chat-snippet");
    expect(within(card).getByText("log.txt")).toBeTruthy();
    expect(card.textContent).toContain("zeile 10");
    expect(card.textContent).not.toContain("zeile 11");
    fireEvent.click(within(card).getByRole("button", { name: "Show all 25 lines" }));
    expect(card.textContent).toContain("zeile 25");
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledWith(code);
  });

  it("a large snippet loads its text from the file", async () => {
    const fetchMock = vi.fn(async () => new Response("aus der Datei\nzwei"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ChatDialogsProvider>
        <SnippetCard snippet={{ title: "big.js", language: "javascript", lines: 2, code: null, url: "mxc://firma.de/abc" }} />
      </ChatDialogsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("chat-snippet").textContent).toContain("aus der Datei"));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("abc");
    vi.unstubAllGlobals();
  });
});
