import { describe, it, expect } from "vitest";
import {
  calculateShiftPhases, calculateCaffeineCutoff, generateTimeline, baseProfile, caffeineHours,
  deriveState, movementInterval, stretchNight, reflectionAdjust, ADJUSTABLE,
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
