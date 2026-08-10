import { describe, it, expect } from "vitest";
import { share } from "./screens/Dashboard.jsx";

/* The dashboard never fabricates a figure, and a meter is a figure. share()
   is the one gate: null means "draw no meter", 0 means "a real, empty meter". */
describe("share", () => {
  it("draws no meter when the value is unknown", () => {
    expect(share(null, 8)).toBe(null);
    expect(share(undefined, 8)).toBe(null);
  });

  it("draws no meter when there is nothing to measure against", () => {
    expect(share(3, 0)).toBe(null);
    expect(share(0, 0)).toBe(null);
  });

  it("draws a real empty meter at zero", () => {
    expect(share(0, 8)).toBe(0);
  });

  it("clamps at full rather than overflowing the track", () => {
    expect(share(4, 8)).toBe(0.5);
    expect(share(12, 8)).toBe(1);
  });
});
