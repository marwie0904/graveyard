import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* The sibling of controls-a11y.test.js, and read the same way: no jsdom here,
   so the check is that the attribute is written. Each one is sliced to the
   component that has to carry it, because every one of these sits a few lines
   from a control that already sets the same attribute and would answer a
   whole-file match on its own. */
const app = readFileSync(new URL("App.jsx", import.meta.url), "utf8");
const bodyOf = (from) => app.split(from)[1].split("\nfunction ")[0];

describe("a control that is one of a set says which one it is", () => {
  /* The five bottom-bar tabs computed `on` and spent every bit of it on ink,
     stroke and weight, so the tab you were standing on had no value to read.
     Pinned as the whole expression: aria-current is not a boolean attribute,
     so the other four have to omit it, and "false" is a value, not absence. */
  it("the tab bar marks the tab you are on", () => {
    expect(bodyOf("function TabBtn(")).toContain('aria-current={on ? "page" : undefined}');
  });

  /* Three columns of a wheel where the selection was a font size. */
  it("the time wheel marks the row in the window", () => {
    expect(bodyOf("function Column(")).toContain("aria-pressed={on}");
  });

  /* Not just state: the switch is a bare track, so the row's label is a
     sibling span outside the button and never reached its name. */
  it("a reminder switch says whether it is on, and what it is", () => {
    const row = app.split("REMINDERS.map((r, k) =>")[1].split("\n      </Card>")[0];
    expect(row).toContain("aria-pressed={on}");
    expect(row).toContain("aria-label={r.l}");
  });

  it("a plan item's Why this says whether it is open", () => {
    expect(bodyOf("function TimelineItem(")).toContain("aria-expanded={open}");
  });
});
