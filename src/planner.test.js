import { describe, it, expect } from "vitest";
import {
  calculateShiftPhases, calculateCaffeineCutoff, generateTimeline, baseProfile, caffeineHours,
  deriveState, movementInterval,
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

describe("nightInStretch", () => {
  const on = (n) => ({ ...P, nightInStretch: n });

  it("treats a profile saved without the field as night one", () => {
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

  it("explains the heavier check-in by the stretch, not by sleep", () => {
    const item = generateTimeline(on(3), [], 0).items.find((i) => i.id === "checkin-1");
    expect(item.changed).toMatch(/night 3 of your stretch/);
  });
});
