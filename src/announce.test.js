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

  /* The ambient sky used to be hushed here by a class, and the class was
     checked by this file. It turned out to suppress nothing — .gy-sky is
     onboarding-only and never renders under the care player — so both are
     gone. drive-coherence.mjs measures the property in a browser instead,
     which is what the coherence criterion asks for and what source text
     could never have shown. */
});
