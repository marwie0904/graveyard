import { describe, it, expect } from "vitest";
import { DOMAIN, WARM, DARK, ACCENT, tint } from "./tokens.js";

/* WCAG 2.x relative luminance and contrast ratio. `rgb` resolves either a
   #RRGGBB literal or one of the rgba() strings tint() and the hero tokens
   produce, composited over whatever hex sits behind it. */
const rgb = (c, under = "#000000") => {
  if (c[0] === "#") {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [r, g, b, a = 1] = c.match(/[\d.]+/g).map(Number);
  const u = rgb(under);
  return [r, g, b].map((v, i) => v * a + u[i] * (1 - a));
};
const lum = (c) => {
  const [r, g, b] = c.map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

/* Rows for one theme: [name, foreground, background, threshold], resolved to
   rgb arrays up front so the it() blocks below are just a walk and a compare. */
const rowsFor = (T) => {
  const k = T.key;
  const under = k === "warm" ? WARM.bg : DARK.card;
  const rows = [
    [`${k} ink/bg`, T.ink, T.bg],
    [`${k} ink/card`, T.ink, T.card],
    [`${k} ink/sunken`, T.ink, T.sunken],
    [`${k} muted/bg`, T.muted, T.bg],
    [`${k} muted/card`, T.muted, T.card],
    [`${k} muted/sunken`, T.muted, T.sunken],
    /* faint is deliberately NOT asserted against `sunken`, because the only
       text on `sunken` is `muted` (App.jsx:1497 and the two intro paragraphs
       at :1367 / :1439); faint's job is the lightest readable tier and
       pinning it to `sunken` too would collapse it into `muted`. */
    [`${k} faint/bg`, T.faint, T.bg],
    [`${k} faint/card`, T.faint, T.card],
    /* The label of a night that holds nothing, in the DayChip strip. It printed
       in `hair` — about 1.08:1 — until the emptiness moved onto the chip's
       circle and its aria-label; the same pair as faint/bg above, kept as its
       own row so a future re-dimming has to fail under its own name. */
    [`${k} empty-night label/bg`, T.faint, T.bg],
    [`${k} heroInk/hero`, T.heroInk, T.hero],
    [`${k} heroMuted/hero`, rgb(T.heroMuted, T.hero), rgb(T.hero)],
  ].map(([name, fg, bg]) => [name, typeof fg === "string" ? rgb(fg) : fg, typeof bg === "string" ? rgb(bg) : bg, 4.5]);

  for (const [key, d] of Object.entries(DOMAIN)) {
    const ink = rgb(d.ink[k]);
    rows.push([`${k} ${key} ink/card`, ink, rgb(T.card), 4.5]);
    rows.push([`${k} ${key} ink/bg`, ink, rgb(T.bg), 4.5]);
    // the worst surface an active domain chip actually paints text on
    rows.push([`${k} ${key} ink/chip`, ink, rgb(tint(d.hue, T.tintA + 0.06), under), 4.5]);
  }
  return rows;
};

/* The other floor, 1.4.11: 3:1 for non-text. Every row here is either the
   boundary that tells you a control is there, the mark that tells you which
   state it is in, or the mark that IS the reading — the three rings in the day
   strip, the borders that are the only thing drawing an unselected Pill,
   Choice, Select or quiet Btn on the surface behind them, and every place a
   domain colour is drawn rather than washed.

   Divider hairlines are deliberately absent, and their absence is the point.
   1.4.11 applies to what is "required to identify user interface components
   and states" and exempts what is "purely decorative"; T.hair separates rows
   and cards and identifies no control, so putting it in this table would fail
   43 call sites and buy a global repaint the success criterion never asked
   for. That exemption is why the empty ring got `edge` rather than a louder
   `hair`. */
const nonTextRowsFor = (T) => {
  const k = T.key;
  const rows = [
    /* DayChip, three states. Empty was `hair` under opacity 0.5 — measured at
       1.08:1 warm and 1.11:1 dark in a browser — and the chip stays tappable
       when empty, so the inactive-control exception does not reach it. */
    [`${k} empty-night ring/bg`, T.edge, T.bg],
    [`${k} logged-night ring/bg`, T.faint, T.bg],
    [`${k} selected-night fill/bg`, T.ink, T.bg],
    /* One token for every unselected control border. Asserted on all three
       surfaces rather than tracing each call site: Pill and Select sit on
       `card`, the day strip and quiet Btn on `bg`, and `sunken` is the one
       left, so the table covers wherever a later screen puts them. */
    [`${k} control edge/card`, T.edge, T.card],
    [`${k} control edge/bg`, T.edge, T.bg],
    [`${k} control edge/sunken`, T.edge, T.sunken],
    /* Choice selected: the accent is both the row's border and the fill of the
       dot, and the dot is the whole of the on/off signal. */
    [`${k} choice selected border/card`, ACCENT, T.card],
    [`${k} choice selected dot/card`, ACCENT, T.card],
    /* RangeControl's Trends select once a longer window is picked */
    [`${k} trends select active/bg`, DOMAIN.sleep.hue, T.bg],
  ];

  /* Every place a domain colour is drawn as a mark rather than washed as a
     background: the icon inside a Badge, the bar of a Dashboard meter, the dot
     beside a plan item, a chart bar or dot. `fill` is the value for all of
     them and this loop is what decides it.

     The surface underneath is not always the card. A Badge icon sits on
     tint(hue, T.tintA) — the hue's own wash, the nearest colour to it anywhere
     in the app, and therefore the row that actually binds. Against the raw hue
     that pair measured 2.09 to 2.95 (light, water, movement and food warm;
     sleep and shift dark): six real failures of the criterion, in the shipped
     build, on the exact class of object 1.4.11 names. The table missed all six
     by holding only the pairs that already passed, and by taking the card for
     the background of a mark that never touches it. */
  for (const [key, d] of Object.entries(DOMAIN)) {
    const f = d.fill[k];
    for (const s of ["card", "bg", "sunken"]) {
      rows.push([`${k} ${key} mark/${s}`, f, T[s]]);
      rows.push([`${k} ${key} badge icon/disc on ${s}`, f, rgb(tint(d.hue, T.tintA), T[s])]);
    }
    /* Dashboard's Stat meter, which washes at 0.16 rather than T.tintA: the
       filled part of the bar against the empty part it runs through. */
    rows.push([`${k} ${key} meter bar/track`, f, rgb(tint(d.hue, 0.16), T.card)]);
  }

  /* Dashboard's charts, all of them inside a Panel and so on `card`. These are
     not indicators of a control's state, they are the reading itself — a bar
     whose length is the hours slept, a dot whose height is a clock time — so
     "required to understand the content" needs no argument here. Each pair
     repeats one the loop above already holds; they are named again so a later
     recolour of one chart fails as that chart rather than as a token.

     Four things on that screen are deliberately not rows:
       - CartesianGrid, drawn in T.hair. Same decoration exemption that keeps
         dividers out of this table; the grid locates nothing the labelled axis
         does not already state.
       - The caffeine dot against the cutoff line it crosses, 1.20 warm and
         1.15 dark. What the chart says is where the dot sits relative to the
         line, and an 8px filled circle against a 1.6px dash is a difference of
         shape and size; recolouring one of them to buy 3:1 would break the
         pairing of hue to domain that the rest of the app reads by.
       - The short-night bar against a full-length one, 1.22 warm and 1.34
         dark. The bar's length is what says the night was short; the food hue
         is a second encoding of a fact the axis has already given.
       - The bullet before each "what the plan noticed" line is the same colour
         on every line, identifies nothing, and is exempt for the reason hair
         is. Dashboard.jsx draws it from `fill` regardless, and says why. */
  const est = rgb(tint(DOMAIN.sleep.hue, 0.16), T.card);
  rows.push(
    [`${k} slept bar/card`, DOMAIN.sleep.fill[k], T.card],
    [`${k} short-night bar/card`, DOMAIN.food.fill[k], T.card],
    [`${k} cutoff line/card`, DOMAIN.sleep.fill[k], T.card],
    [`${k} caffeine dot/card`, DOMAIN.caffeine.fill[k], T.card],
    /* the MiniPlan dot takes whichever domain the item is; shift is the
       fallback for an item with none, and the loop holds the other seven */
    [`${k} plan item dot/card`, DOMAIN.shift.fill[k], T.card],
    /* The estimated sleep bar is the one mark colour could not settle on its
       own. A wash pale enough to read as "estimated" is 1.64:1 warm and 1.45:1
       dark on the card, so an outline in the sleep fill is what identifies it
       as a bar; hollow against filled is what tells it from a real reading.
       The wash then came DOWN, 0.35 to 0.16, not up: at 0.35 it measured 3.09
       against a slept bar warm but 2.53 dark, and every step of alpha that
       fixes the dark reading walks the estimated bar further into the solid
       one until the distinction the chart depends on is gone. */
    [`${k} estimated bar outline/card`, DOMAIN.sleep.fill[k], T.card],
    [`${k} estimated bar/slept bar`, est, DOMAIN.sleep.fill[k]],
    [`${k} estimated bar/short-night bar`, est, DOMAIN.food.fill[k]],
  );

  return rows.map(([name, fg, bg]) =>
    [name, typeof fg === "string" ? rgb(fg) : fg, typeof bg === "string" ? rgb(bg) : bg, 3]);
};

describe("non-text contrast", () => {
  for (const T of [WARM, DARK]) {
    it(`clears 3:1 for every ${T.key} control boundary and state indicator`, () => {
      const failures = nonTextRowsFor(T)
        .map(([name, fg, bg, min]) => [name, ratio(fg, bg), min])
        .filter(([, r, min]) => r < min)
        .map(([name, r]) => `${name}: ${r.toFixed(2)}`);
      expect(failures).toEqual([]);
    });
  }

  /* The table proves the token clears 3:1. It cannot prove the ring still uses
     the token, and `hair` under an opacity is exactly the shape of the bug it
     would miss — so the one component carrying the state reads its own source,
     the way the sweep at the foot of this file does. */
  it("draws the empty-night ring from edge and never dims it back down", async () => {
    const { readFileSync } = await import("node:fs");
    const chip = readFileSync(new URL("ui/index.jsx", import.meta.url), "utf8")
      .split("function DayChip(")[1].split("\n}")[0];
    expect(chip).toContain("T.edge");
    // the prose above the ring is free to name what it stopped doing; the style is not
    expect(chip).not.toMatch(/border:[^\n]*T\.hair/);
    expect(chip).not.toMatch(/opacity\s*:/);
  });

  /* Same reason, one screen over. The table proves the fill values clear 3:1;
     only the source proves the charts still draw from them, and a chart mark
     that quietly reverts to `.hue` is the failure this whole table was added
     for. Two uses of a raw hue survive here and both are legitimate: inside
     tint(), which is the wash, and as the `hue` prop Stat takes — Stat is
     where fillOf turns it into the bar. */
  it("draws every Dashboard mark from fill, and outlines the estimated bar", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("screens/Dashboard.jsx", import.meta.url), "utf8");
    const marks = src.replace(/tint\([^)]*\)/g, "wash").replace(/hue=\{[^}]*\}/g, "hue=");
    expect(marks.match(/DOMAIN\.\w+\.hue/g)).toBe(null);
    expect(src).toContain("background: fillOf(hue, T)");
    // the pale bar is 1.45:1 on the dark card; the outline is the whole of it
    expect(src).toMatch(/stroke=\{d\.estimated \? DOMAIN\.sleep\.fill/);
  });
});

describe("WARM contrast", () => {
  it("clears 4.5:1 for every text token on every surface it is used on", () => {
    const failures = rowsFor(WARM)
      .map(([name, fg, bg, min]) => [name, ratio(fg, bg), min])
      .filter(([, r, min]) => r < min)
      .map(([name, r]) => `${name}: ${r.toFixed(2)}`);
    expect(failures).toEqual([]);
  });
});

describe("DARK contrast", () => {
  it("clears 4.5:1 for every text token on every surface it is used on", () => {
    const failures = rowsFor(DARK)
      .map(([name, fg, bg, min]) => [name, ratio(fg, bg), min])
      .filter(([, r, min]) => r < min)
      .map(([name, r]) => `${name}: ${r.toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  /* The raised panel behind the time picker and the log editor: the lightest
     surface the dark theme paints under text. */
  it("clears 4.5:1 for muted on the raised panel behind the time picker", () => {
    expect(ratio(rgb(DARK.muted), rgb("rgba(255,255,255,0.06)", DARK.card))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("ACCENT contrast", () => {
  /* Btn kind="accent" and the Trends chip in RangeControl both print white on
     the accent, and the accent is a domain hue — theme-independent. */
  it("clears 4.5:1 for white text on the accent", () => {
    expect(ratio(rgb("#FFFFFF"), rgb(ACCENT))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("DOMAIN.ink", () => {
  /* The point: `hue` stays the fill and `ink` is the only text value, so a
     future "simplification" that aliases them is caught. */
  it("never equals the raw hue it was derived from, in either theme", () => {
    for (const d of Object.values(DOMAIN)) {
      expect(d.ink.warm).not.toBe(d.hue);
      expect(d.ink.dark).not.toBe(d.hue);
    }
  });
});

describe("the contrast helper", () => {
  it("reads pure black on pure white as exactly 21", () => {
    expect(ratio(rgb("#000000"), rgb("#FFFFFF"))).toBe(21);
  });
});

/* The table above can only guard colours that are in the table. A hex written
   straight into a component is invisible to it and to the sweep that moved the
   domain hues over — which is exactly how a 4.28:1 "Circadian low" badge
   survived both. White is the one honest literal: it is the label colour on a
   filled accent, where the fill is the token being checked. */
describe("no colour escapes the token table", () => {
  it("has no hardcoded text colour outside tokens.js", async () => {
    const { readFileSync } = await import("node:fs");
    const files = ["App.jsx", "ui/index.jsx", "screens/Dashboard.jsx", "screens/Tour.jsx"];
    const offenders = files.flatMap((f) =>
      readFileSync(new URL(f, import.meta.url), "utf8").split("\n")
        .map((line, i) => ({ line: line.trim(), at: `${f}:${i + 1}` }))
        .filter(({ line }) => /color: *"#/.test(line) && !/#FFFFFF|#FFF"/i.test(line))
        .map(({ line, at }) => `${at}  ${line}`));
    expect(offenders).toEqual([]);
  });
});
