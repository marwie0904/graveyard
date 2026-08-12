import { describe, it, expect } from "vitest";
import {
  rangeStats, readPatterns, foldNight, achievements, RANGES, dayOffsetOf, MIN_TREND,
  countStretch, sleepBand,
} from "./stats.js";
import { materializeNights } from "./mockNights.js";

const P = {
  shiftStart: "22:00", shiftEnd: "06:00", plannedSleep: "07:30",
  sleepGoalHours: 7, caffeine: "moderate", caffeineSensitivity: "normal",
  nap: "both", movement: "mixed", lightEnv: "bright",
  commute: "drive", sleepiestTime: "deep", overrides: {},
};

describe("RANGES", () => {
  it("offers only multi-night windows, since one night is picked off the strip", () => {
    expect(RANGES.map((r) => r.label))
      .toEqual(["3 days", "1 week", "2 weeks", "1 month", "All time"]);
    expect(RANGES.every((r) => r.days > 1)).toBe(true);
  });

  /* The field is a span of days, not a count of records: against a sparse
     archive an intermittent worker's "1 week" would otherwise reach back a
     month, and every average would describe a window nobody chose. */
  it("measures a window in days and carries no record count", () => {
    // Infinity, not 999: unreachable as a record count, 2.7 years as a day count
    expect(RANGES.map((r) => r.days)).toEqual([3, 7, 14, 30, Infinity]);
    expect(RANGES.every((r) => r.nights === undefined)).toBe(true);
  });
});

describe("dayOffsetOf", () => {
  it("reads a day key back as its offset", () => {
    expect(dayOffsetOf("d0")).toBe(0);
    expect(dayOffsetOf("d6")).toBe(6);
  });

  it("returns null for a window key, so the dashboard renders the range view", () => {
    expect(dayOffsetOf("1w")).toBe(null);
    expect(dayOffsetOf("all")).toBe(null);
    expect(dayOffsetOf(undefined)).toBe(null);
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
  it("returns null when nothing was logged and nothing was answered", () => {
    expect(foldNight(P, [], {})).toBeNull();
  });

  /* The reflection Selects write straight to state without a log entry, so a
     night answered but never tapped used to fold to null and be discarded. */
  it("folds a night whose only record is the reflection", () => {
    const night = foldNight(P, [], { slept: "Under 5h", sleepiest: "Deep night" });
    expect(night.sleepHours).toBe(4.5);
    expect(night.sleepEstimated).toBe(true);
    expect(night.sleepyWindow).toBe("deep");
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

/* A NightRecord with only the fields achievements reads. Everything else on the
   real shape is irrelevant here and would only make the failures harder to read. */
const rec = (extra = {}) => ({
  id: "2026-08-11", sleepHours: 7, cutoff: 1290, caffeine: [1000],
  moveDone: 0, moveTotal: 4, restKind: "none", restMin: 0, endShift: false, ...extra,
});
const got = (badges, key) => badges.find((b) => b.key === key).got;

describe("MIN_TREND", () => {
  it("is the threshold readPatterns already used to decide it may claim a relationship", () => {
    expect(MIN_TREND).toBe(5);
  });

  it("suppresses the relationship claim at MIN_TREND - 1 nights", () => {
    const nights = materializeNights(P).slice(0, MIN_TREND - 1);
    const pat = readPatterns(P, rangeStats(P, nights));
    expect(pat.mainPattern).toBe(`${MIN_TREND - 1} nights on record, and patterns need about a week to show up.`);
  });

  it("stops suppressing it at MIN_TREND nights, so the constant and the branch cannot drift", () => {
    const nights = materializeNights(P).slice(0, MIN_TREND);
    const pat = readPatterns(P, rangeStats(P, nights));
    expect(pat.mainPattern).not.toMatch(/on record, and patterns need/);
  });
});

describe("foldNight endShift", () => {
  it("records the end-of-shift check so the badge survives the rollover", () => {
    const logs = [{ id: "e-1", t: 1800, type: "endShift", value: 1 }];
    expect(foldNight(P, logs, {}).endShift).toBe(true);
  });

  it("is false, not undefined, for a night that was logged but never ended", () => {
    const logs = [{ id: "w-1", t: 1400, type: "water", value: 1 }];
    expect(foldNight(P, logs, {}).endShift).toBe(false);
  });
});

describe("achievements", () => {
  it("returns all seven, none earned, for a user with nothing at all", () => {
    const badges = achievements(P, [], []);
    expect(badges).toHaveLength(7);
    expect(badges.every((b) => b.got === false)).toBe(true);
  });

  /* isLateNight is false for a night with no caffeine at all, so three nights of
     drinking nothing used to earn "every cup landed before your cutoff" for zero
     cups. The mock drank on all 45 nights, so it never showed. */
  it("does not earn Stopped early for three nights with no caffeine logged", () => {
    const nights = [rec({ caffeine: [] }), rec({ caffeine: [] }), rec({ caffeine: [] })];
    expect(got(achievements(P, [], nights), "early")).toBe(false);
  });

  it("earns Stopped early for three nights that each had a drink before the cutoff", () => {
    const nights = [rec(), rec(), rec()];
    expect(got(achievements(P, [], nights), "early")).toBe(true);
  });

  it("does not earn Stopped early at two clean nights", () => {
    expect(got(achievements(P, [], [rec(), rec()]), "early")).toBe(false);
  });

  /* The rollover-survival case: Phase 2 clears the logs at the boundary, so a
     badge that counts tonight's logs un-earns itself every morning. */
  it("earns Reset habit from the records when the logs are empty", () => {
    const nights = [rec({ moveDone: 3 }), rec({ moveDone: 2 })];
    expect(got(achievements(P, [], nights), "reset")).toBe(true);
  });

  it("does not earn Reset habit at four resets", () => {
    const nights = [rec({ moveDone: 3 }), rec({ moveDone: 1 })];
    expect(got(achievements(P, [], nights), "reset")).toBe(false);
  });

  it("earns Home safe from a record when the logs are empty", () => {
    expect(got(achievements(P, [], [rec({ endShift: true })]), "home")).toBe(true);
  });

  it("does not earn Home safe when no night on record ended the shift", () => {
    expect(got(achievements(P, [], [rec(), rec()]), "home")).toBe(false);
  });

  /* The mock is the demo, and a demo with a conspicuously dark "Home safe"
     across 45 nights reads as a bug. This is also the only assertion on
     materializeNights's new literal. */
  it("earns Home safe from the mock, so the seeded demo is not missing a badge", () => {
    expect(got(achievements(P, [], materializeNights(P)), "home")).toBe(true);
  });
});

/* Tonight, for every countStretch case below. Records are named by their offset
   back from it, so a case reads as the shape of the run rather than as a list of
   dates: `back(1)` is last night. Date.parse reads a bare date as UTC midnight
   and toISOString reads it back the same way, so this is exact. */
const TONIGHT = "2026-08-13";
const back = (o) => new Date(Date.parse(TONIGHT) - o * 864e5).toISOString().slice(0, 10);
const arch = (...offsets) => offsets.map((o) => ({ id: back(o) }));

describe("countStretch", () => {
  it("counts tonight as night one when there is no archive and no seed to carry", () => {
    expect(countStretch([], TONIGHT, 1)).toBe(1);
  });

  it("carries the quiz answer on day one, when the archive cannot contradict it", () => {
    expect(countStretch([], TONIGHT, 3)).toBe(3);
  });

  /* The day-two regression, and the whole reason the quiz answer is a seed
     rather than a fallback: a fallback reads 2 here, so the number goes DOWN
     while the stretch goes up and the caffeine cutoff relaxes by an hour on
     night four. */
  it("adds the walk to the seed on day two, instead of counting back down", () => {
    expect(countStretch(arch(1), TONIGHT, 3)).toBe(4);
  });

  it("counts an unbroken run back from tonight", () => {
    expect(countStretch(arch(1, 2, 3), TONIGHT, 1)).toBe(4);
  });

  it("keeps the seed while nothing on record contradicts it", () => {
    expect(countStretch(arch(1, 2, 3), TONIGHT, 3)).toBe(6);
  });

  /* The bridge. It reads one low on purpose — the bridged night is not counted,
     only forgiven — and the plan reads the number at 2, 3 and 4-or-more only, so
     one low changes nothing except exactly on a boundary. */
  it("bridges one missing night without counting it", () => {
    expect(countStretch(arch(1, 3), TONIGHT, 1)).toBe(3);
  });

  it("ends the stretch on two missing nights, and kills the seed with it", () => {
    expect(countStretch(arch(1, 4), TONIGHT, 3)).toBe(2);
  });

  it("reads night one after three nights away", () => {
    expect(countStretch(arch(3, 4, 5), TONIGHT, 1)).toBe(1);
  });

  it("ignores a record dated tonight, which is never in the archive", () => {
    expect(countStretch(arch(0), TONIGHT, 1)).toBe(1);
  });

  /* Reachable from a device clock moved backward, and from a hand-edited blob.
     A future record must neither count nor extend the run. */
  it("ignores a future-dated record", () => {
    expect(countStretch(arch(-2), TONIGHT, 1)).toBe(1);
  });

  it("counts two records with the same id once, and the seed still applies", () => {
    expect(countStretch([{ id: back(1) }, { id: back(1) }], TONIGHT, 3)).toBe(4);
  });

  it("drops a record whose id is not a date, without throwing", () => {
    expect(countStretch([{ id: "not-a-date" }], TONIGHT, 1)).toBe(1);
  });

  /* The trust boundary. `overrides` and `nightInStretch` both come off a blob a
     user can hand-edit, and an unclamped 999 makes every night night one
     thousand — which is night four's plan, forever, for someone on night one. */
  it("clamps a seed the quiz could never have produced", () => {
    expect(countStretch([], TONIGHT, 999)).toBe(4);
    expect(countStretch([], TONIGHT, -5)).toBe(1);
  });

  it("treats a missing, unparseable or zero seed as night one", () => {
    expect(countStretch([], TONIGHT, undefined)).toBe(1);
    expect(countStretch([], TONIGHT, "x")).toBe(1);
    expect(countStretch([], TONIGHT, 0)).toBe(1);
  });

  it("returns the seed when there is no night to count back from", () => {
    // every offset is NaN, so the walk is empty and the seed is all there is
    expect(countStretch(arch(1, 2), undefined, 3)).toBe(3);
  });

  it("tolerates a missing archive", () => {
    expect(countStretch(undefined, TONIGHT, 1)).toBe(1);
    expect(countStretch(null, TONIGHT, 2)).toBe(2);
  });

  it("is uncapped, because a stretch has no maximum the plan cares about", () => {
    expect(countStretch(arch(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), TONIGHT, 1)).toBe(11);
  });
});

describe("sleepBand", () => {
  /* The fixed-point property the sleep proposal depends on: the four values the
     quiz can express each band to themselves, which is what makes
     `sleepBand(avg) !== goal` a complete trigger with no tolerance to tune. */
  it("is a fixed point on each of the four values the quiz offers", () => {
    for (const h of [4.5, 5.5, 7.5, 9.5]) expect(sleepBand(h)).toBe(h);
  });

  it("cuts where planSummary cuts", () => {
    expect(sleepBand(5.0)).toBe(4.5);
    expect(sleepBand(6.6)).toBe(7.5);
    expect(sleepBand(9.1)).toBe(9.5);
  });

  it("has no gap at either end", () => {
    expect(sleepBand(0)).toBe(4.5);
    expect(sleepBand(24)).toBe(9.5);
  });
});
