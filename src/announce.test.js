import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Source text, like the token sweep next door: there is no DOM in this suite,
   and both failures below are "the markup quietly stopped saying it". */
const app = readFileSync(new URL("App.jsx", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("saying where you landed", () => {
  /* Two regions, deliberately. The toast is a confirmation and the other is a
     destination; folding navigation into say() means whichever message lands
     second wipes the first mid-sentence. */
  it("announces navigation somewhere other than the toast region", () => {
    expect(html).toMatch(/id="gy-where"[\s\S]{0,80}aria-live="polite"/);
    expect(app).toContain('getElementById("gy-where")');
    expect(app).toMatch(/role="status" aria-live="polite"/);
  });

  it("stops the ambient sky while a care session is playing", () => {
    expect(html).toMatch(/\.gy-hushed \.gy-sky,\s*\.gy-hushed \.gy-sky::before,\s*\.gy-hushed \.gy-sky::after \{ animation: none !important; \}/);
    expect(app).toMatch(/playing \?[^\n]*gy-hushed/);
  });
});
