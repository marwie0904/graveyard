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
