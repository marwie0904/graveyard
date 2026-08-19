import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* No jsdom here, so these read the source the way the token sweep at the foot
   of tokens.test.js does. Both controls shipped as toggles that never said
   whether they were on, and both are one attribute away from correct, which is
   exactly the kind of line a later edit drops without noticing. Each check is
   sliced to its own component: sibling controls in the same files already set
   the attribute and would satisfy a whole-file match on their own. */
const bodyOf = (file, from) =>
  readFileSync(new URL(file, import.meta.url), "utf8").split(from)[1].split("\nfunction ")[0];

describe("toggle controls report their state", () => {
  it("Pill says whether it is selected", () => {
    expect(bodyOf("ui/index.jsx", "export function Pill(")).toContain("aria-pressed={active}");
  });

  /* The five hand-rolled disclosures — this one, a plan item's "Why this", the
     logged row, the logged group and a log entry — became one shared
     Disclosure, so the attribute moved with them. Two halves now: Section has
     to be using the control, and the control has to carry the attribute.
     visual-consistency.test.js is what stops a sixth being hand-rolled. */
  it("the plan section's disclosure says whether it is open", () => {
    expect(bodyOf("App.jsx", "function Section(")).toContain("<Disclosure");
    expect(readFileSync(new URL("ui/index.jsx", import.meta.url), "utf8"))
      .toMatch(/export function Disclosure\([\s\S]*?aria-expanded=\{open\}/);
  });
});
