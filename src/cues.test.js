import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { sequenceOf, cueFor, DONE_CUE } from "./cues.js";

/* CARE lives in App.jsx next to the icons it renders, so the coverage check
   reads it as text, the way reminders.test.js reads REMINDERS. Reading source
   in a test is a lint, not a behaviour check, and this is the lint that fails
   when somebody adds a step the player cannot say. */
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const CARE_SRC = app.split("const CARE = [")[1].split("\n];")[0];
/* every step entry, in either shape, is written `{ l: "…", s: N` */
const steps = [...CARE_SRC.matchAll(/\{ l: "([^"]*)", s: (\d+)/g)]
  .map(([, l, s]) => ({ l, s: Number(s) }));

describe("the cue corpus", () => {
  it("still finds all five activities, so the lint cannot pass vacuously", () => {
    expect(CARE_SRC.match(/\n    k: "/g)).toHaveLength(5);
  });

  it("finds the steps of every activity", () => {
    // two breathing cycles and three step sequences, 25 entries between them
    expect(steps.length).toBeGreaterThanOrEqual(20);
  });

  it("gives every step something to say", () => {
    expect(steps.filter((x) => !cueFor(x))).toEqual([]);
  });

  it("gives every step a positive duration to say it in", () => {
    expect(steps.filter((x) => !(x.s > 0))).toEqual([]);
  });

  it("has a closing cue", () => {
    expect(DONE_CUE.trim()).not.toBe("");
  });
});

describe("sequenceOf", () => {
  it("repeats a cycle to fill the stated minutes", () => {
    const seq = sequenceOf({ cycle: [{ l: "in", s: 4 }, { l: "out", s: 4 }], mins: 2 });
    expect(seq).toHaveLength(30); // 120s / 8s = 15 repetitions of 2 steps
    expect(seq.every((x) => cueFor(x))).toBe(true);
  });

  it("runs at least one cycle even when the pattern is longer than the activity", () => {
    expect(sequenceOf({ cycle: [{ l: "in", s: 90 }], mins: 1 })).toHaveLength(1);
  });

  it("returns a step sequence unchanged", () => {
    const steps2 = [{ l: "stand", s: 30 }, { l: "sit", s: 30 }];
    expect(sequenceOf({ steps: steps2, mins: 1 })).toBe(steps2);
  });
});

describe("cueFor", () => {
  it("trims the label", () => {
    expect(cueFor({ l: "  Breathe in  " })).toBe("Breathe in");
  });

  it("says nothing rather than 'undefined' when a step has no label", () => {
    expect(cueFor({ s: 4 })).toBe("");
    expect(cueFor(undefined)).toBe("");
  });
});
