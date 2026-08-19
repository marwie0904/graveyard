import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Three sweeps over source, in the shape of the "no colour escapes the token
   table" one at the foot of tokens.test.js and for the same reason: each of
   these bugs is invisible to a contrast table, because none of them is a
   colour pair. A container opacity is a multiplier over every descendant, a
   hand-rolled control is a colour table that was simply never consulted, and a
   hue drawn as a mark is the right token used for the wrong job. Every pattern
   below is written to fire on one shape and nothing else — a sweep broad
   enough to catch innocent code gets deleted the first time it cries wolf, and
   then it is guarding nothing. */
const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
/* Comments are blanked, line count and all: the prose above every one of these
   fixes names the thing it stopped doing, quoting the old declaration, and a
   sweep that cannot tell a style from a sentence about a style would make the
   comments unwritable. tokens.test.js draws the same line around DayChip. */
const linesOf = (f) => src(f)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .split("\n").map((line, i) => ({ line, at: `${f}:${i + 1}` }));

/* Five of these were hand-rolled in App.jsx and had drifted into five different
   controls: two caret glyphs, one of them absent entirely, four paddings, four
   gaps and four type treatments for a single "open this" gesture. They are one
   `Disclosure` now, which is the only thing in the app allowed to write the
   attribute — so a sixth written by hand cannot reach main without failing
   here. Scanned across every screen, not just the file they came from: the
   point is that there is one of these, not that App.jsx has none. */
describe("one disclosure control, not one per call site", () => {
  it("has no hand-rolled expandable control outside ui/index.jsx", () => {
    const files = ["App.jsx", "screens/Dashboard.jsx", "screens/Tour.jsx"];
    const offenders = files.flatMap((f) => linesOf(f)
      .filter(({ line }) => /aria-expanded/.test(line))
      .map(({ line, at }) => `${at}  ${line.trim()}`));
    expect(offenders).toEqual([]);
  });
});

/* TimelineItem set `opacity: locked ? 0.72 : 1` on the whole Card, which
   composited every descendant with it: muted fell to 3.23:1 warm and 3.47:1
   dark, faint — ItemMeta, so the domain label and the scheduled time — to
   3.06:1 and 3.05:1. Three more did the same: the generating screen's pending
   steps at 0.34 (1.58:1), the unearned achievement tiles at 0.5 (2.16:1 for
   their description), and the quiz's not-yet-answerable button over its own
   white label.

   None of that is visible to a token-pair table, which is the whole danger:
   the table keeps passing while the screen stops being readable. tokens.test.js
   already bans the shape inside DayChip; this is the same ban over both files.

   The carve-out is the one WCAG makes itself. 1.4.3 and 1.4.11 exempt an
   inactive user interface component, so an opacity is allowed exactly where a
   `disabled` attribute is sitting on the same element — which today is the two
   steppers in the adjust sheet at their limits and nothing else. Four lines of
   window because that is the height of a style block plus the tag that opens
   it; a `disabled` any further away is not on this element. */
describe("no container opacity dims text", () => {
  it("dims nothing that is not a disabled control", () => {
    const offenders = ["App.jsx", "ui/index.jsx"].flatMap((f) => {
      const rows = linesOf(f);
      return rows
        .filter(({ line }, i) => /opacity\s*:/.test(line)
          && !/disabled=/.test(rows.slice(Math.max(0, i - 4), i + 1).map((r) => r.line).join("\n")))
        .map(({ line, at }) => `${at}  ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});

/* `hue` and `fill` are one word apart at a call site and a table cannot tell
   them apart, because both are legitimate tokens — the question is only which
   job the call site is doing. `hue` is the argument to tint(), where the result
   is a background and nothing has to be legible against it. `fill` is the mark:
   an icon, a dot, the border that says which item the plan is waiting on.

   Drawing a hue is how Badge's icon printed at 2.09:1 for `light` in warm, on
   the hue's own wash; how the done Check printed at 2.30:1; and how the current
   plan item — a state indicator, which is what 1.4.11 names in as many words —
   was outlined at 1.50:1.

   The carve-out, and it is the whole of the distinction: tint(), fillOf() and
   inkOf() are the three functions that are supposed to be handed a hue, so a
   hue inside one of them is stripped before the line is read. `hue ?` is a
   truthiness test, not a colour — Pill and Btn both ask whether they were given
   one before looking up its ink. Anything else reaching a colour property is a
   hue being painted. */
describe("a hue is washed, never drawn", () => {
  it("has no raw hue used as a mark in App.jsx or ui/index.jsx", () => {
    const drawn = /\b(?:\w*[Cc]olor|fill|stroke)\s*[=:][^\n]*?\bhue\b(?!\s*\?)/;
    const offenders = ["App.jsx", "ui/index.jsx"].flatMap((f) => linesOf(f)
      .filter(({ line }) => drawn.test(line.replace(/\b(?:tint|fillOf|inkOf)\([^)]*\)/g, "()")))
      .map(({ line, at }) => `${at}  ${line.trim()}`));
    expect(offenders).toEqual([]);
  });

  /* The sweep can only fail on a hue that is still there. This is the other
     half: the three call sites the report measured have to be reading `fill`,
     so "fixed" cannot quietly become "deleted the icon". */
  it("draws Badge's icon, a done Check and the current item's border from fill", () => {
    expect(src("ui/index.jsx")).toMatch(/<I size=\{size \* 0\.45\} color=\{d\.fill\[T\.key\]\}/);
    expect(src("App.jsx")).toMatch(/<Check size=\{15\} color=\{d\.fill\[T\.key\]\}/);
    expect(src("App.jsx")).toMatch(/border: current \? `1\.5px solid \$\{d\.fill\[T\.key\]\}`/);
  });
});
