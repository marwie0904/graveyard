import { describe, it, expect } from "vitest";
import { rangeStats, readPatterns, foldNight, RANGES } from "./stats.js";
import { materializeNights } from "./mockNights.js";

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", sedentary: "some", breakControl: "high", lightEnv: "bright",
  commute: "drive", mealPattern: "before", sleepiestTime: "deep", overrides: {},
};

describe("RANGES", () => {
  it("offers Today, 3 days, 1 week inline and the rest under More", () => {
    expect(RANGES.filter((r) => !r.inMore).map((r) => r.label))
      .toEqual(["Today", "3 days", "1 week"]);
    expect(RANGES.filter((r) => r.inMore).map((r) => r.label))
      .toEqual(["2 weeks", "1 month", "All time"]);
  });
});

describe("rangeStats on empty input", () => {
  /* Regression: Math.min/Math.max over [] returns -Infinity/Infinity, which
     previously reached the DOM as "Moved by about -Infinity hours" and as
     <YAxis domain={[Infinity, -Infinity]}>. */
  it("returns null rather than Infinity or NaN", () => {
    const st = rangeStats(P, []);
    expect(st.n).toBe(0);
    for (const k of ["avgSleep", "movePct", "wakeDrift", "sleepyWindow"]) {
      expect(st[k]).toBeNull();
    }
    /* JSON.stringify serialises both Infinity and NaN as the literal `null`,
       so a regex over the serialised form can never catch either. Check the
       live values instead. */
    const bad = Object.entries(st).filter(
      ([, v]) => typeof v === "number" && !Number.isFinite(v)
    );
    expect(bad).toEqual([]);
  });
});

describe("rangeStats on the mock", () => {
  const nights = materializeNights(P);

  it("computes an average in a plausible range", () => {
    const st = rangeStats(P, nights);
    expect(st.n).toBe(45);
    expect(st.avgSleep).toBeGreaterThan(5);
    expect(st.avgSleep).toBeLessThan(9);
  });

  /* Regression: the old seedHistory computed sleepyWindow and then failed to
     return it, so every range in the app reported "early" forever. */
  it("does not report the same sleepy window for every range", () => {
    const windows = [3, 7, 14, 45].map((k) => rangeStats(P, nights.slice(0, k)).sleepyWindow);
    expect(new Set(windows).size).toBeGreaterThan(1);
  });

  /* The test above discriminates via one tie-break, so it would still pass if
     the field were read wrongly. These pin the field read directly. */
  it("reads sleepyWindow off the record rather than deriving it", () => {
    const base = nights[0];
    for (const w of ["early", "mid", "deep", "late"]) {
      const synthetic = Array.from({ length: 5 }, (_, i) => ({
        ...base, id: `s${i}`, dayOffset: i + 1, sleepyWindow: w,
      }));
      expect(rangeStats(P, synthetic).sleepyWindow).toBe(w);
    }
  });

  it("returns null, not a default window, when no record carries one", () => {
    const blank = nights.slice(0, 5).map((h, i) => ({ ...h, id: `b${i}`, sleepyWindow: null }));
    expect(rangeStats(P, blank).sleepyWindow).toBeNull();
  });

  it("surfaces the caffeine correlation as the main pattern", () => {
    const pat = readPatterns(P, rangeStats(P, nights));
    expect(pat.mainPattern).toMatch(/caffeine/i);
  });

  it("suppresses the main pattern below five nights", () => {
    const pat = readPatterns(P, rangeStats(P, nights.slice(0, 3)));
    expect(pat.mainPattern).not.toMatch(/caffeine crossed the cutoff/i);
  });
});

describe("foldNight", () => {
  it("returns null when nothing was logged", () => {
    expect(foldNight(P, [], {})).toBeNull();
  });

  it("measures sleep from the sleepStart and wake logs", () => {
    const logs = [
      { id: "a", t: 450, type: "sleepStart", value: 1 },
      { id: "b", t: 450 + 7 * 60, type: "wake", value: "ontime" },
    ];
    const night = foldNight(P, logs, {});
    expect(night.sleepHours).toBeCloseTo(7, 1);
    expect(night.sleepEstimated).toBe(false);
  });

  it("falls back to the reflection bucket and flags the night estimated", () => {
    const logs = [{ id: "a", t: 450, type: "sleepStart", value: 1 }];
    const night = foldNight(P, logs, { slept: "5–6h" });
    expect(night.sleepHours).toBe(5.5);
    expect(night.sleepEstimated).toBe(true);
  });

  it("leaves sleepHours null when there is neither a log pair nor a bucket", () => {
    const night = foldNight(P, [{ id: "a", t: 100, type: "water", value: 1 }], {});
    expect(night.sleepHours).toBeNull();
  });

  it("excludes null-sleep nights from the average instead of counting them as zero", () => {
    const nights = materializeNights(P).slice(0, 4);
    const withNull = [...nights, { ...nights[0], id: "x", sleepHours: null }];
    expect(rangeStats(P, withNull).avgSleep).toBeCloseTo(rangeStats(P, nights).avgSleep, 5);
  });
});
