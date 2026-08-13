import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CITATIONS } from "./citations.js";
import {
  calculateShiftPhases, calculateCaffeineCutoff, generateTimeline, baseProfile, caffeineHours,
  deriveState, movementInterval, stretchNight, reflectionAdjust, ADJUSTABLE, planGate,
} from "./planner.js";

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", movement: "mixed", lightEnv: "bright",
  commute: "drive", sleepiestTime: "deep", overrides: {},
};

describe("calculateShiftPhases", () => {
  it("handles a shift crossing midnight", () => {
    const ph = calculateShiftPhases(P);
    expect(ph.length).toBe(480);
    expect(ph.end).toBeGreaterThan(ph.start);
  });
  it("finds the 02:00-05:00 circadian low inside the shift", () => {
    const ph = calculateShiftPhases(P);
    expect(ph.deepNight).not.toBeNull();
    expect(ph.deepNight[1] - ph.deepNight[0]).toBe(180);
  });
  it("reports no deep night for a shift that misses 02:00-05:00", () => {
    const ph = calculateShiftPhases({ ...P, shiftStart: "06:00", shiftEnd: "14:00" });
    expect(ph.deepNight).toBeNull();
  });
});

describe("calculateCaffeineCutoff", () => {
  it("returns null when the user takes no caffeine", () => {
    const p = { ...P, caffeine: "none" };
    expect(calculateCaffeineCutoff(p, calculateShiftPhases(p))).toBeNull();
  });

  /* Regression: a cutoff of exactly 0 is legitimate, not "no cutoff".
     Shift 00:00-05:00, sleep 06:00, normal sensitivity -> sleepStart 360,
     cutoff 360 - 360 = 0. The old `if (s.cutoff)` dropped the card and
     silently disabled all caffeine sleep-protection. */
  it("treats a cutoff of 0 as a real cutoff", () => {
    const p = { ...P, shiftStart: "00:00", shiftEnd: "05:00", plannedSleep: "06:00" };
    const ph = calculateShiftPhases(p);
    expect(calculateCaffeineCutoff(p, ph)).toBe(0);

    const ids = generateTimeline(p, [], ph.start + 60).items.map((i) => i.id);
    expect(ids).toContain("caff-cutoff");
  });
});

describe("baseProfile", () => {
  it("strips overrides so defaults are computable", () => {
    const p = { ...P, overrides: { caffeineHours: 9 } };
    expect(caffeineHours(p)).toBe(9);
    expect(caffeineHours(baseProfile(p))).toBe(6);
  });
});

describe("generateTimeline", () => {
  it("returns items sorted by time", () => {
    const ph = calculateShiftPhases(P);
    const { items } = generateTimeline(P, [], ph.start);
    const times = items.map((i) => i.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
  it("gives every item a unique id", () => {
    const ph = calculateShiftPhases(P);
    const ids = generateTimeline(P, [], ph.start).items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* The plan is answered in order and every answer is timestamped, so the gate
   and the card's "Done · 11:42 PM" line both read the same entry. */
describe("the item gate", () => {
  const itemLog = (id, status, t) => ({ id: `${id}-${t}`, t, type: "item", value: { id, status } });

  it("carries the time an item was answered, and the last answer wins", () => {
    const ph = calculateShiftPhases(P);
    const logs = [itemLog("pre-meal", "skipped", 1200), itemLog("pre-meal", "done", 1260)];
    const s = deriveState(P, logs, 1300, ph);
    expect(s.itemStatus("pre-meal")).toBe("done");
    expect(s.itemLog("pre-meal").t).toBe(1260);
    expect(s.itemLog("hydrate-start")).toBeNull();
  });

  it("waits on the earliest unanswered item and locks everything after it", () => {
    const { items, state } = generateTimeline(P, [], calculateShiftPhases(P).start);
    const gate = planGate(items, state.itemStatus);
    expect(gate.blocker.id).toBe(items[0].id);
    expect(gate.locked(items[0].id)).toBe(false);
    expect(gate.locked(items[1].id)).toBe(true);
    expect(gate.locked(items[items.length - 1].id)).toBe(true);
  });

  /* All three ways of answering count, which is the whole point of the gate:
     it asks that you deal with the item, not that you do it. */
  it.each(["done", "skipped", "adjusted"])("moves past an item answered as %s", (status) => {
    const ph = calculateShiftPhases(P);
    const first = generateTimeline(P, [], ph.start).items[0];
    const logs = [itemLog(first.id, status, ph.start)];
    const { items, state } = generateTimeline(P, logs, ph.start);
    const gate = planGate(items, state.itemStatus);
    expect(gate.blocker.id).not.toBe(first.id);
    expect(gate.locked(first.id)).toBe(false);
    expect(gate.locked(gate.blocker.id)).toBe(false);
  });

  it("locks nothing once every item has been answered", () => {
    const ph = calculateShiftPhases(P);
    const { items } = generateTimeline(P, [], ph.start);
    const logs = items.map((i, k) => itemLog(i.id, "done", ph.start + k));
    const done = generateTimeline(P, logs, ph.start);
    const gate = planGate(done.items, done.state.itemStatus);
    expect(gate.blocker).toBeNull();
    expect(done.items.some((i) => gate.locked(i.id))).toBe(false);
  });
});

/* Regression: a cutoff of exactly 0 (midnight) is real, not absent. The
   truthiness test in deriveState silently disabled caffeine sleep-protection
   for any shift whose cutoff landed on midnight. */
describe("deriveState with a midnight cutoff", () => {
  const P0 = {
    shiftStart: "00:00", shiftEnd: "05:00", plannedSleep: "06:00",
    sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
    nap: "both", movement: "mixed", lightEnv: "bright",
    commute: "drive", sleepiestTime: "deep", overrides: {},
  };

  it("still flags caffeine logged after a cutoff of 0", () => {
    const ph = calculateShiftPhases(P0);
    expect(calculateCaffeineCutoff(P0, ph)).toBe(0);
    const logs = [{ id: "c", t: 60, type: "caffeine", value: 1 }];
    expect(deriveState(P0, logs, 120, ph).lateCaffeine).toBe(true);
  });

  it("does not flag caffeine logged before it", () => {
    const ph = calculateShiftPhases(P0);
    const logs = [{ id: "c", t: -120, type: "caffeine", value: 1 }];
    expect(deriveState(P0, logs, 120, ph).lateCaffeine).toBe(false);
  });
});

/* The quiz answer is still read — it is the seed for the nights that were
   already behind you before the archive starts — but it is no longer the only
   thing that can name the night. `stretch` is what stats.countStretch measured,
   it is never stored, and it wins. */
describe("stretchNight", () => {
  it("prefers the counted night to the told one", () => {
    expect(stretchNight({ stretch: 4, nightInStretch: 1 })).toBe(4);
  });

  it("falls back to the quiz answer when nothing has been counted", () => {
    expect(stretchNight({ nightInStretch: 3 })).toBe(3);
  });

  it("reads as night one for a profile that has neither", () => {
    expect(stretchNight({})).toBe(1);
  });
});

describe("the night of the stretch, driven by the counted field", () => {
  const on = (n) => ({ ...P, stretch: n });
  const told = (n) => ({ ...P, nightInStretch: n });

  it("treats a profile saved without either field as night one", () => {
    expect(caffeineHours(P)).toBe(caffeineHours(on(1)));
    expect(movementInterval(P)).toBe(movementInterval(on(1)));
  });

  it("stops caffeine an hour earlier from the third night", () => {
    expect(caffeineHours(on(2))).toBe(caffeineHours(on(1)));
    expect(caffeineHours(on(3))).toBe(caffeineHours(on(1)) + 1);
  });

  it("shortens the gap between resets as the stretch runs on", () => {
    expect(movementInterval(on(2))).toBe(movementInterval(on(1)) - 15);
    expect(movementInterval(on(4))).toBe(movementInterval(on(1)) - 30);
  });

  it("explains the heavier check-in by the counted night, not by sleep", () => {
    const item = generateTimeline(on(3), [], 0).items.find((i) => i.id === "checkin-1");
    expect(item.changed).toMatch(/night 3 of your stretch/);
  });

  /* The seed still drives everything when there is no count — a profile that
     has never been through the memo, which is every profile boot folds. */
  it("drives the same three behaviours off the quiz answer when there is no count", () => {
    expect(caffeineHours(told(3))).toBe(caffeineHours(told(1)) + 1);
    expect(movementInterval(told(4))).toBe(movementInterval(told(1)) - 30);
  });

  /* Load-bearing: the "default" the adjust sheet offers to return to is the
     plan's own default FOR TONIGHT, stretch included. */
  it("keeps the count and drops the overrides in baseProfile", () => {
    const b = baseProfile({ ...P, stretch: 4, overrides: { caffeineHours: 9 } });
    expect(b.stretch).toBe(4);
    expect(b.overrides).toEqual({});
  });

  /* `ov` sits above the stretch by design: a number the user set by hand beats
     one the app derived. */
  it("lets an explicit override beat the derived count", () => {
    expect(caffeineHours({ ...P, stretch: 4, overrides: { caffeineHours: 9 } })).toBe(9);
    expect(movementInterval({ ...P, stretch: 4, overrides: { moveGap: 60 } })).toBe(60);
  });
});

describe("reflectionAdjust", () => {
  it("maps Earlier caffeine cutoff to one hour past the plan's own default", () => {
    const r = reflectionAdjust(P, "Earlier caffeine cutoff");
    expect(r.key).toBe("caffeineHours");
    expect(r.value).toBe(caffeineHours(baseProfile(P)) + 1);
  });

  /* The button is still on screen after it is pressed. Set-from-default rather
     than stepped is what makes the second press a no-op instead of a ratchet. */
  it("is idempotent: the same answer twice is the same number", () => {
    const once = reflectionAdjust(P, "Earlier caffeine cutoff");
    const twice = reflectionAdjust(
      { ...P, overrides: { caffeineHours: once.value } }, "Earlier caffeine cutoff"
    );
    expect(twice.value).toBe(once.value);
  });

  it("never moves a number the user set by hand backward", () => {
    const r = reflectionAdjust({ ...P, overrides: { caffeineHours: 9 } }, "Earlier caffeine cutoff");
    expect(r.value).toBe(9);
  });

  /* The trust boundary. `overrides` comes off a hand-editable blob, and
     Math.max("x", 150) is NaN — which ov() hands to the planner as a real
     value and which makes the movement loop emit zero resets for a whole
     shift. A floor that is not a number is not a floor. */
  it("ignores a non-numeric override instead of poisoning the value with NaN", () => {
    const r = reflectionAdjust({ ...P, overrides: { moveGap: "x" } }, "Fewer resets");
    expect(r.value).toBe(movementInterval(baseProfile(P)) + 30);
  });

  it("says so when the number did not move", () => {
    const r = reflectionAdjust({ ...P, overrides: { caffeineHours: 9 } }, "Earlier caffeine cutoff");
    expect(r.msg).toBe("That is already where your plan is.");
  });

  /* high sensitivity (8) + sleep under five hours (+1) + a deep stretch (+1) is
     already 10, which is the top of the slider. +1 would leave the range the
     adjust sheet can express, so it stops. */
  it("clamps the caffeine cutoff to the top of the slider's range", () => {
    const deep = { ...P, caffeineSensitivity: "high", sleepGoalHours: 4.5, stretch: 3 };
    expect(caffeineHours(baseProfile(deep))).toBe(10);
    expect(reflectionAdjust(deep, "Earlier caffeine cutoff").value)
      .toBe(ADJUSTABLE.caffeineHours.max);
  });

  it("reads the stretch off the profile it is handed", () => {
    const one = reflectionAdjust({ ...P, stretch: 1 }, "Earlier caffeine cutoff").value;
    const four = reflectionAdjust({ ...P, stretch: 4 }, "Earlier caffeine cutoff").value;
    expect(four).toBe(one + 1);
  });

  it("maps Fewer resets to thirty more minutes of spacing", () => {
    const r = reflectionAdjust(P, "Fewer resets");
    expect(r.key).toBe("moveGap");
    expect(r.value).toBe(movementInterval(baseProfile(P)) + 30);
  });

  it("clamps the reset gap to the top of its range too", () => {
    const r = reflectionAdjust({ ...P, overrides: { moveGap: ADJUSTABLE.moveGap.max } }, "Fewer resets");
    expect(r.value).toBe(ADJUSTABLE.moveGap.max);
  });

  /* 30 is the ceiling the deep-rest item's own `why` already names, not a
     number picked to be a number. */
  it("maps More rest to thirty minutes flat", () => {
    const r = reflectionAdjust(P, "More rest");
    expect(r.key).toBe("restLength");
    expect(r.value).toBe(30);
  });

  /* The toast is the only thing the user sees at the moment it happens, so it
     has to be true. On these two profiles the number reaches no item at all. */
  it("refuses More rest on a profile that cannot nap, and says why", () => {
    const r = reflectionAdjust({ ...P, nap: "none" }, "More rest");
    expect(r.key).toBeNull();
    expect(r.msg).toBe("You said naps are not possible, so the plan keeps rest short and quiet instead.");
  });

  it("refuses Earlier caffeine cutoff on a profile with no caffeine, and says why", () => {
    const r = reflectionAdjust({ ...P, caffeine: "none" }, "Earlier caffeine cutoff");
    expect(r.key).toBeNull();
    expect(r.msg).toBe("Caffeine is already off your plan, so there is nothing to move earlier.");
  });

  it("returns null for Nothing, for an unanswered question, and for gibberish", () => {
    expect(reflectionAdjust(P, "Nothing")).toBeNull();
    expect(reflectionAdjust(P, undefined)).toBeNull();
    expect(reflectionAdjust(P, "gibberish")).toBeNull();
  });

  it("names the resulting number in every message it does write", () => {
    expect(reflectionAdjust(P, "Earlier caffeine cutoff").msg)
      .toBe(`Caffeine now stops ${caffeineHours(baseProfile(P)) + 1} hours before sleep.`);
    expect(reflectionAdjust(P, "Fewer resets").msg)
      .toBe(`A reset every ${movementInterval(baseProfile(P)) + 30} minutes now.`);
    expect(reflectionAdjust(P, "More rest").msg).toBe("Rest blocks are now 30 minutes.");
  });
});

/* ------------------------------- traceability -----------------------------
   Phase 6. Chapter III claims the traceability check "is performed against
   citation identifiers recorded on each plan item alongside its user-facing
   rationale, so that the check is executed against the running system rather
   than against separately maintained documentation." This block is that check.
   The mapping itself is deliberately NOT duplicated here. A test asserting that
   planner.js equals a copy of planner.js proves nothing and doubles the
   maintenance; nothing automatable can check that burke2015 supports
   caff-cutoff. Part 3 of
   docs/superpowers/specs/2026-08-13-traceability-design.md is the mapping, and
   a reader with docs/research-summary.md open is the review it asks for. */
describe("traceability", () => {
  const PH = calculateShiftPhases(P);
  const E = { ...P, shiftStart: "06:00", shiftEnd: "14:00", plannedSleep: "15:00" };
  const PH_E = calculateShiftPhases(E);

  /* Eight profiles, chosen to reach every conditional branch, all built by
     spreading the P fixture this file already defines. Twelve of the 25 items
     are conditional, so one profile is not a matrix.
     Every log time is PH.start + n, never a bare integer: a log at t: 190 on a
     22:00 shift is 19 hours before the plan starts and fires nothing, which is
     how the spec's own first inventory silently missed two reactive inserts and
     came back with 24 ids instead of 25. */
  const MATRIX = [
    ["A baseline", P, [], PH.start],
    ["B woke late -> pre-min", P,
      [{ id: "w", t: PH.start - 200, type: "wake", value: "later" }], PH.start],
    ["C short goal + woke early -> pre-nap", { ...P, sleepGoalHours: 5 },
      [{ id: "w", t: PH.start - 200, type: "wake", value: "earlier" }], PH.start],
    ["D high caffeine -> caff-swap", { ...P, caffeine: "high" }, [], PH.start],
    ["E no deep night -> hard-warn", E, [], PH_E.start],
    ["F nap logged -> nap-buffer", P,
      [{ id: "n", t: PH.start + 180, type: "nap", value: "ok" }], PH.start + 200],
    ["G water gap -> water-now", P,
      [{ id: "wa", t: PH.start, type: "water", value: 1 }], PH.start + 200],
    ["H screen strain -> eye-break", P,
      [{ id: "s", t: PH.start + 190, type: "screen", value: 1 }], PH.start + 200],
  ];

  /* Every item any of the eight profiles emits, duplicates included. The union
     of their ids is exactly the 25 of Part 3 with move-N collapsed; A-H return
     20, 20, 21, 21, 19, 21, 21 and 21 items. Those counts are asserted by
     drive-cite.mjs against the running app, not here — pinning them in the unit
     suite would rot on the first legitimate new item. */
  const ALL = MATRIX.flatMap(([, p, logs, now]) => generateTimeline(p, logs, now).items);

  /* T1's corpus. Read as text on purpose: the runtime matrix cannot see an item
     behind a condition no profile reaches, and a coin-flip gate is not a gate.
     Reading source in a test is a lint, not a behaviour check. */
  const SRC = readFileSync(new URL("./planner.js", import.meta.url), "utf8");
  const blocks = SRC.split("add({").slice(1);

  /* T1. The assertion that actually fails when someone adds an uncited item, and
     the reason the other three can be simple. `add({` is the single construction
     idiom in planner.js — 25 occurrences, one items.push, and it is inside add. */
  it("constructs no plan item without a src, on any branch, reachable or not", () => {
    /* split("});")[0], NOT slice(0, indexOf("});")): indexOf returns -1 if a
       block ever loses its terminator, slice(0, -1) then searches the entire
       rest of the file, and the missing src passes. Same length, one fewer way
       to be wrong.
       No AST walk: acorn is not installed here — only esbuild, via vite — so a
       real parse means a new dependency for the same four lines. */
    const missing = blocks
      .map((b) => b.split("});")[0])
      .filter((b) => !b.includes("src:"))
      // report ids rather than blocks: a failure nobody can read is a failure
      // somebody deletes
      .map((b) => (b.match(/id: [`"]([^`"$]*)/) || [, "?"])[1]);
    expect(missing).toEqual([]);
  });

  /* T1b. The lint's own anchor. Without this, a refactor that renames add() or
     moves the construction site leaves `blocks` empty, `missing` trivially empty
     and T1 green — a gate reporting success because it stopped looking.
     The number is pinned, so a legitimate 26th item fails here too and the
     count is bumped in the same commit that adds it. That overrules the spec's
     edge-case row "someone adds a 26th item, cited -> passes all four": it
     passes all four, and then this one line asks you to say so on purpose. */
  it("still finds all 25 construction sites, so the lint cannot pass vacuously", () => {
    expect(blocks).toHaveLength(25);
  });

  /* T2. §3's own test, with a matrix behind it instead of one profile.
     `!i.src?.length` catches an empty array, undefined and null in one
     expression, which is why §3 wrote it that way. */
  it("emits no item without a src across the eight-profile matrix", () => {
    const bare = ALL.filter((i) => !i.src?.length).map((i) => i.id);
    expect(bare).toEqual([]);
  });

  /* T2b. The hole T2 leaves open: `!"burke2015"?.length` is false, so a single
     key written as a bare string passes T2 and is then read character by
     character by everything downstream. §3 picked the array; this is what makes
     that choice enforced rather than remembered.
     Shape only. A key that is empty, a number or null is T3's job in Task 2 —
     none of them survives Object.hasOwn — so this is one predicate, not two. */
  it("gives every item an array of keys, not a bare string", () => {
    const wrong = ALL.filter((i) => !Array.isArray(i.src)).map((i) => i.id);
    expect(wrong).toEqual([]);
  });

  /* T3. Without this, src: ["burke2016"] passes T2 and points at nothing — a
     citation identifier that identifies no citation, which is the failure that
     would make the paper's claim false while looking like proof of it. It also
     catches the other direction: a key deleted from CITATIONS while an item
     still cites it.
     Object.hasOwn, NOT `k in CITATIONS`: `in` walks the prototype chain, so
     src: ["toString"] and src: ["constructor"] resolve against a plain object
     and this passes on a key that identifies nothing. Same length, and it is
     also the only guard on a key that is empty, a number or null, which is why
     T2b checks shape only. */
  it("resolves every key an item cites in CITATIONS", () => {
    const unknown = [...new Set(ALL.flatMap((i) => i.src))]
      .filter((k) => !Object.hasOwn(CITATIONS, k));
    expect(unknown).toEqual([]);
  });

  /* T4. Ten items whose intervention has no supporting study in the corpus, and
     two that are navigation rather than recommendation. Both lists are frozen
     here so that marking a new item evidence-free is a decision somebody makes
     on purpose, in this file, under this comment.
     TWO literals, not one set of twelve: a single union PASSES when an item is
     relabelled judgement -> structural, and that relabel is exactly the
     laundering Part 3 forbids ("structural would pass the same test and is a
     lie"). The assertion that exists to stop marker creep cannot be the one
     that cannot see it. A count would be worse than either — it passes when one
     item gains the marker and another loses it.
     The 13 sourced items are pinned by nothing but T1 and T3, on purpose: a
     third frozen list of 25 strings would rot and catch nothing. */
  const JUDGEMENT = [
    "caff-swap", "commute", "eye-break", "food-late", "hard-warn",
    "hydrate-start", "pre-meal", "pre-min", "snack", "water-now",
  ];
  const STRUCTURAL = ["end-shift", "shift-start"];
  const marked = (m) => [...new Set(ALL.filter((i) => i.src.includes(m)).map((i) => i.id))].sort();

  it("marks exactly ten items as design judgement and exactly two as navigational", () => {
    expect(marked("judgement")).toEqual(JUDGEMENT);
    expect(marked("structural")).toEqual(STRUCTURAL);
  });

  /* T4b. Clause 2 of the judgement rule: a study key may sit beside the marker
     to name the risk a judgement rule addresses, but it does not support the
     rule. Exactly five items do that. A sixth means somebody borrowed a citation
     because the CATEGORY matched — eye-break is a short break and dallora2020 is
     about short breaks, but the item's claim is ocular. A key that survives a
     category match and fails a claim match converts a known gap into a hidden
     one, which is worse than judgement, and this line is the only thing in the
     suite that can see it happen. */
  it("lets a study key name the risk beside judgement on exactly five items", () => {
    const withStudy = marked("judgement")
      .filter((id) => ALL.find((i) => i.id === id).src.length > 1);
    expect(withStudy).toEqual(["caff-swap", "commute", "food-late", "pre-meal", "snack"]);
  });
});
