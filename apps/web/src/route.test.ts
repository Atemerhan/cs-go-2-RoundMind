import { describe, expect, it } from "vitest";
import { routeFromHash } from "./route";

describe("routeFromHash", () => {
  it("keeps the review on a hash so GitHub Pages does not need a server", () => {
    expect(routeFromHash("")).toBe("calculator");
    expect(routeFromHash("#calculator")).toBe("calculator");
    expect(routeFromHash("#review")).toBe("review");
    expect(routeFromHash("#/review")).toBe("review");
    expect(routeFromHash("#review?x=1")).toBe("review");
  });
});