import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "de" }));
vi.mock("@/lib/xenaxio/bff", async (orig) => ({ ...(await orig<typeof import("@/lib/xenaxio/bff")>()), XENAXIO_BFF: true }));

import { xenaxio, XenaxioApiError } from "@/lib/xenaxio/api";
import { useXenaxioMeStore } from "@/lib/xenaxio/me-store";
import { useAuthStore } from "@/stores/auth-store";
import { NameForm, XenaxioNameSetting } from "../name-setting";

describe("step 101: the own name in Settings → Account", () => {
  beforeEach(() => {
    useXenaxioMeStore.setState({
      me: { user: { id: "u1", email: "anna@acme.de", displayName: "Anna Schmidt", role: "user", mustChangePassword: false }, tenant: { id: "t1", name: "Acme", status: "active" }, edition: "cloud" },
      loadedAt: Date.now(),
    });
    useAuthStore.setState({ refreshIdentities: vi.fn(async () => undefined) } as never);
  });

  it("saves the name and shows it everywhere at once", async () => {
    const setMyName = vi.spyOn(xenaxio, "setMyName").mockResolvedValue({ displayName: "Anna Müller" });
    render(<XenaxioNameSetting />);
    expect(screen.getByText("Name")).toBeTruthy();
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.value).toBe("Anna Schmidt");
    const save = screen.getByRole("button", { name: "Name speichern" }) as HTMLButtonElement;
    // Nothing changed: nothing to save.
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "  Anna  Müller " } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Name gespeichert.")).toBeTruthy());
    expect(setMyName).toHaveBeenCalledWith("  Anna  Müller ");
    expect(useXenaxioMeStore.getState().me?.user.displayName).toBe("Anna Müller");
    expect(input.value).toBe("Anna Müller");
    expect(useAuthStore.getState().refreshIdentities).toHaveBeenCalled();
  });

  it("shows the platform's refusal next to the field", async () => {
    const save = vi.fn(async () => {
      throw new XenaxioApiError(400, "person_name_too_long");
    });
    render(<NameForm initial="Tom" save={save} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(50) } });
    fireEvent.click(screen.getByRole("button", { name: "Name speichern" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Der Name darf höchstens 100 Zeichen haben."));
  });
});
