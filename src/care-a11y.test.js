import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Same trick as the token sweep: there is no DOM in this suite, so the source
   is the thing under test. Both failures below were invisible to every test
   that renders nothing. */
const src = readFileSync(new URL("App.jsx", import.meta.url), "utf8");
const between = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

describe("the care list", () => {
  /* The row is the only door into the player. As a Card it was a div with an
     onClick, so a keyboard or Switch Control user could reach the tab bar and
     nothing else on the screen. */
  it("plays an activity from a button, not a div", () => {
    const liveTab = between("function LiveTab(", "function ProfileRow(");
    expect(liveTab).toMatch(/<button [^>]*onClick=\{\(\) => setPlaying\(c\.k\)\}/);
    expect(liveTab).not.toMatch(/<Card[^>]*onClick/);
  });
});

describe("the care player", () => {
  const player = between("function CarePlayer(", "/* ---------------------- quick log");

  /* Segmenting: the steps are named and bounded, but until this button the
     only thing that could cross a boundary was the interval. */
  it("advances a step on the user's command", () => {
    expect(player).toMatch(/<Btn[^>]*onClick=\{\(\) => setElapsed\(Math\.min\(acc \+ step\.s, total\)\)\}>Next step<\/Btn>/s);
  });

  /* The new button sits above the old pair rather than replacing either. */
  it("still pauses and still finishes early", () => {
    expect(player).toMatch(/setRunning\(!running\)/);
    expect(player).toMatch(/setElapsed\(total\)\}>Finish early/);
  });
});
