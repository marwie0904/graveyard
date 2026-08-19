import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Source-text assertions, like the rest of the component checks here: there is
   no DOM in this suite to query. The region is the reflection screen only —
   LogTab — so the other screens' controls can't paper over a gap in this one. */
const src = readFileSync(new URL("App.jsx", import.meta.url), "utf8");
const region = src.slice(src.indexOf("function LogTab("), src.indexOf("function LiveTab("));

describe("the reflection screen's time controls", () => {
  /* Attributes only: everything from `<select` up to the first `<option` is the
     open tag, and no attribute value here contains that string. */
  it("names every one of them, so hour and minute aren't told apart by order", () => {
    const tags = region.split("<select").slice(1).map((s) => s.slice(0, s.indexOf("<option")));
    expect(tags.length).toBe(6);
    expect(tags.filter((t) => !/aria-label=/.test(t))).toEqual([]);
  });
});

describe("a logged entry's row", () => {
  /* Still a real control with a real state — it is the shared Disclosure now,
     which is the button and writes the attribute. Sliced from the opening
     bracket up to the toggle itself, so a plain div here still fails. */
  it("is a disclosure that says whether it is open", () => {
    const i = region.indexOf("setEditingLog(open ? null : l.id)");
    const tag = region.slice(region.lastIndexOf("<", i), i);
    expect(tag.startsWith("<Disclosure")).toBe(true);
    expect(tag).toMatch(/open=\{open\}/);
  });
});
