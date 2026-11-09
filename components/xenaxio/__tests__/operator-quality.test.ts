// Step 146: shares on the "Assistant quality" page.
import { describe, expect, it } from "vitest";
import { share } from "../operator-quality";

describe("share", () => {
  it("rounds to a whole percent and shows a dash without a base", () => {
    expect(share(1, 3)).toBe("33 %");
    expect(share(0, 10)).toBe("0 %");
    expect(share(2, 0)).toBe("–");
  });
});
