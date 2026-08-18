import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TOUR } from "./screens/Tour.jsx";

/* The tour switches tabs by name, and the names live in App.jsx's TABS array,
   which is local to the component and not importable. Read them out of the
   source the same way the token guard does: a renamed tab would otherwise send
   goTour to a key nothing renders, which is a blank screen under the card. */
const tabs = [...readFileSync(new URL("App.jsx", import.meta.url), "utf8")
  .split("const TABS = [")[1].split("];")[0]
  .matchAll(/k: "(\w+)"/g)].map((m) => m[1]);

describe("the tour", () => {
  it("only ever switches to a tab the app renders", () => {
    expect(tabs).toContain("plan");
    expect(TOUR.filter((s) => !tabs.includes(s.tab))).toEqual([]);
  });

  it("says something on every step", () => {
    expect(TOUR.filter((s) => !s.title || !s.body)).toEqual([]);
  });
});
