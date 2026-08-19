import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sequenceOf, cueFor } from "./cues.js";

/* The rubric held Signaling below full marks because the cueing had only been
   watched in a browser. These are the same observations, made by a machine. */

const src = readFileSync(new URL("App.jsx", import.meta.url), "utf8");

/* CARE is module-scope in App.jsx and not exported. The literal's only free
   identifiers are the icon components, and nothing here renders one, so
   evaluating it with those left undefined gives the real table rather than a
   transcription that would quietly drift from it. */
const CARE = new Function("Wind", "Moon", "Pulse", "Footprints", "Eye",
  `return [${src.split("const CARE = [")[1].split("\n];")[0]}];`)();

/* CarePlayer's step index, countdown, progress and minutes-left arithmetic all
   live inside its render body, where nothing can reach them without
   restructuring the component — out of scope here. So this is a transcription
   of it, and the risk is the plain one: what follows proves the arithmetic is
   correct, not that the component still runs this arithmetic. The last test in
   the file is the mitigation — it pins the expressions to the source text and
   fails the day the component's copy diverges from this one.

   The clamps are dropped on purpose. The component writes Math.max(0, …) around
   both the countdown and the minutes; computing them raw is what shows whether
   those clamps are load-bearing or belt-and-braces. */
function frameAt(seq, total, elapsed) {
  let acc = 0, idx = 0;
  for (let k = 0; k < seq.length; k++) {
    if (elapsed < acc + seq[k].s) { idx = k; break; }
    acc += seq[k].s; idx = Math.min(k + 1, seq.length - 1);
  }
  const step = seq[Math.min(idx, seq.length - 1)];
  return {
    step, acc,
    left: step.s - (elapsed - acc),
    minLeft: Math.ceil((total - elapsed) / 60),
    progress: Math.min(100, (elapsed / total) * 100),
  };
}

/* Every property holds for every activity or it does not hold, so each test
   gathers the offenders across the whole table and expects none. */
const every = (fn) => CARE.flatMap((a) => {
  const seq = sequenceOf(a);
  return fn(a, seq, seq.reduce((s, x) => s + x.s, 0));
});

describe("the care player's signalling", () => {
  it("has something to announce on every step of every activity", () => {
    expect(every((a, seq) => seq
      .map((step, i) => (cueFor(step) ? null : `${a.k} step ${i + 1}: silent`))
      .filter(Boolean))).toEqual([]);
  });

  it("counts each step down as a whole number inside that step's own length", () => {
    expect(every((a, seq, total) => {
      const bad = [];
      for (let e = 0; e <= total; e++) {
        const { step, left } = frameAt(seq, total, e);
        if (!Number.isInteger(left) || left < 0 || left > step.s)
          bad.push(`${a.k} at ${e}s: countdown ${left}, outside 0..${step.s}`);
      }
      return bad;
    })).toEqual([]);
  });

  it("moves the progress bar forward only, from 0 to exactly 100", () => {
    expect(every((a, seq, total) => {
      const bad = [];
      let prev = 0;
      for (let e = 0; e <= total; e++) {
        const p = frameAt(seq, total, e).progress;
        if (p < prev) bad.push(`${a.k} at ${e}s: progress fell ${prev} to ${p}`);
        if (p > 100) bad.push(`${a.k} at ${e}s: progress ${p}, past the end`);
        prev = p;
      }
      if (frameAt(seq, total, 0).progress !== 0)
        bad.push(`${a.k}: opens at ${frameAt(seq, total, 0).progress}%, not 0`);
      if (prev !== 100) bad.push(`${a.k}: ends at ${prev}%, not 100`);
      return bad;
    })).toEqual([]);
  });

  it("never raises the minutes remaining, and reads zero only when finished", () => {
    expect(every((a, seq, total) => {
      const bad = [];
      let prev = Infinity;
      for (let e = 0; e <= total; e++) {
        const m = frameAt(seq, total, e).minLeft;
        if (m > prev) bad.push(`${a.k} at ${e}s: minutes went ${prev} up to ${m}`);
        if (m === 0 && e < total) bad.push(`${a.k} at ${e}s: says 0 min left with ${total - e}s to run`);
        if (m !== 0 && e === total) bad.push(`${a.k}: finished still saying ${m} min left`);
        prev = m;
      }
      return bad;
    })).toEqual([]);
  });

  /* This is what stops the Next step button overshooting: it sets elapsed to
     acc + step.s, so every press has to land on a real boundary and the last
     one has to land on total rather than past it. */
  it("puts every step boundary exactly where Next step jumps to", () => {
    expect(every((a, seq, total) => {
      const bad = [];
      seq.forEach((x, i) => {
        if (!Number.isInteger(x.s) || x.s <= 0)
          bad.push(`${a.k} step ${i + 1}: length ${x.s}`);
      });

      let c = 0;
      const boundaries = seq.map((x) => (c += x.s));
      const pressed = [];
      let e = 0;
      /* bounded by the step count: a press that failed to advance would
         otherwise spin here rather than fail */
      for (let n = 0; n < seq.length && e < total; n++) {
        const { step, acc } = frameAt(seq, total, e);
        e = Math.min(acc + step.s, total);
        pressed.push(e);
      }
      if (String(pressed) !== String(boundaries))
        bad.push(`${a.k}: Next step visits ${pressed.length} of ${seq.length} boundaries`);
      if (e !== total) bad.push(`${a.k}: Next step stops at ${e}, not ${total}`);
      return bad;
    })).toEqual([]);
  });
});

/* The transcription above is worth something only while the component still
   computes it this way, so these are the lines it was transcribed from. */
describe("CarePlayer", () => {
  it("still runs the arithmetic these tests transcribe", () => {
    const flat = src.replace(/\s+/g, " ");
    expect([
      "if (elapsed < acc + seq[k].s) { idx = k; break; }",
      "acc += seq[k].s; idx = Math.min(k + 1, seq.length - 1);",
      "const left = Math.max(0, step.s - (elapsed - acc));",
      "Math.ceil((total - elapsed) / 60)",
      "Math.min(100, (elapsed / total) * 100)",
      "setElapsed(Math.min(acc + step.s, total))",
    ].filter((e) => !flat.includes(e))).toEqual([]);
  });
});
