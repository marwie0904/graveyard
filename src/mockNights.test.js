import { describe, it, expect } from "vitest";
import { MOCK_ROWS, materializeNights } from "./mockNights.js";
import { calculateShiftPhases, calculateCaffeineCutoff } from "./planner.js";
import { nightAxis } from "./time.js";

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", sedentary: "some", breakControl: "high", lightEnv: "bright",
  commute: "drive", mealPattern: "before", sleepiestTime: "deep", overrides: {},
};

const isLate = (n) => n.cutoff !== null && n.caffeine.some((c) => nightAxis(c) >= nightAxis(n.cutoff));

describe("MOCK_ROWS", () => {
  it("has 45 rows with unique consecutive dayOffsets 1..45", () => {
    expect(MOCK_ROWS).toHaveLength(45);
    expect(MOCK_ROWS.map((r) => r.dayOffset)).toEqual(
      Array.from({ length: 45 }, (_, i) => i + 1)
    );
  });
  it("stores offsets, never absolute clock times", () => {
    for (const r of MOCK_ROWS) {
      expect(Math.abs(r.sleepStartDelta)).toBeLessThanOrEqual(120);
    }
  });
});

describe("materializeNights", () => {
  it("produces one record per row, all clock fields in range", () => {
    const nights = materializeNights(P);
    expect(nights).toHaveLength(45);
    for (const n of nights) {
      expect(n.sleepStart).toBeGreaterThanOrEqual(0);
      expect(n.sleepStart).toBeLessThan(1440);
      expect(n.wake).toBeGreaterThanOrEqual(0);
      expect(n.wake).toBeLessThan(1440);
      expect(n.sleepEstimated).toBe(false);
      expect(n.moveDone).toBeLessThanOrEqual(n.moveTotal);
    }
  });

  /* The whole point of the dataset: the app's headline claim must be true of it. */
  it("encodes the late-caffeine/short-sleep correlation", () => {
    const nights = materializeNights(P);
    const late = nights.filter(isLate);
    const clean = nights.filter((n) => !isLate(n));
    expect(late.length).toBeGreaterThanOrEqual(9);
    expect(late.length).toBeLessThanOrEqual(14);
    const avg = (a) => a.reduce((s, n) => s + n.sleepHours, 0) / a.length;
    const delta = avg(clean) - avg(late);
    expect(delta).toBeGreaterThan(1.0);
    expect(delta).toBeLessThan(1.9);
  });

  /* Counting late nights alone would still pass if the clean and late rows
     swapped identity, so assert per-row that the authored intent survives:
     a row with `late: null` must never register as late, for any profile. */
  it("keeps every authored-clean night clean across profiles", () => {
    for (const variant of [
      { caffeineSensitivity: "high" },
      { caffeineSensitivity: "low" },
      { sleepGoalHours: 5 },
      { plannedSleep: "10:00" },
      { overrides: { caffeineHours: 10 } },
    ]) {
      const nights = materializeNights({ ...P, ...variant });
      nights.forEach((n, i) => {
        const authoredLate = MOCK_ROWS[i].late !== null;
        expect([JSON.stringify(variant), n.dayOffset, isLate(n)])
          .toEqual([JSON.stringify(variant), n.dayOffset, authoredLate]);
      });
    }
  });

  it("moves with the profile instead of staying fixed", () => {
    const a = materializeNights(P);
    const b = materializeNights({ ...P, plannedSleep: "10:00" });
    expect(a[0].sleepStart).not.toBe(b[0].sleepStart);
  });

  it("logs no caffeine when the profile takes none", () => {
    const nights = materializeNights({ ...P, caffeine: "none" });
    for (const n of nights) {
      expect(n.caffeine).toEqual([]);
      expect(n.cutoff).toBeNull();
    }
  });

  it("varies sleepyWindow across all four values", () => {
    const seen = new Set(materializeNights(P).map((n) => n.sleepyWindow));
    expect(seen).toEqual(new Set(["early", "mid", "deep", "late"]));
  });
});
