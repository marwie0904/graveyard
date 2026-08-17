import { describe, it, expect } from "vitest";
import { nextFocusIndex } from "./focus.js";

/* The wrap is the whole trap: if either end stops wrapping, Tab walks out of
   an open sheet into the screen it covers and nothing else in the app
   notices. */
describe("nextFocusIndex", () => {
  it("wraps forward off the last item back to the first", () => {
    expect(nextFocusIndex(4, 3, false)).toBe(0);
  });

  it("wraps backward off the first item to the last", () => {
    expect(nextFocusIndex(4, 0, true)).toBe(3);
  });

  it("steps one at a time in between", () => {
    expect(nextFocusIndex(4, 1, false)).toBe(2);
    expect(nextFocusIndex(4, 2, true)).toBe(1);
  });

  /* -1 is focus on the panel itself, which is where it sits the moment a
     sheet with no focusable child opens, and where it reads as when focus has
     escaped the panel entirely. Both directions have to pull it back in. */
  it("pulls focus that is not in the ring back into it", () => {
    expect(nextFocusIndex(4, -1, false)).toBe(0);
    expect(nextFocusIndex(4, -1, true)).toBe(3);
  });

  it("has nowhere to send focus in an empty panel", () => {
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
    expect(nextFocusIndex(0, -1, true)).toBe(-1);
  });
});
