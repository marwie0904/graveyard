import { describe, it, expect } from "vitest";
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick, nightOf, forward } from "./time.js";

describe("toMin", () => {
  it("converts HH:MM to minutes past midnight", () => {
    expect(toMin("00:00")).toBe(0);
    expect(toMin("22:30")).toBe(1350);
  });
});

describe("fmt", () => {
  it("formats midnight as 12:00 AM, not 0:00 AM", () => {
    expect(fmt(0)).toBe("12:00 AM");
  });
  it("formats noon as 12:00 PM", () => {
    expect(fmt(720)).toBe("12:00 PM");
  });
  it("wraps past a day", () => {
    expect(fmt(DAY + 90)).toBe("1:30 AM");
  });
  it("handles negative absolute times", () => {
    expect(fmt(-30)).toBe("11:30 PM");
  });
});

describe("nextAfter", () => {
  it("returns the same instant when the clock time already matches", () => {
    expect(nextAfter(600, 600)).toBe(600);
  });
  it("rolls forward a day when the clock time has passed", () => {
    expect(nextAfter(1300, 360)).toBe(DAY + 360);
  });
});

describe("overlap", () => {
  it("returns the intersection", () => {
    expect(overlap([0, 100], [50, 200])).toEqual([50, 100]);
  });
  it("returns null when ranges only touch", () => {
    expect(overlap([0, 100], [100, 200])).toBeNull();
  });
});

describe("dur", () => {
  it("formats hours and minutes", () => {
    expect(dur(90)).toBe("1h 30m");
    expect(dur(120)).toBe("2h");
    expect(dur(45)).toBe("45m");
  });
});

describe("nightAxis / nightTick", () => {
  it("keeps an evening-to-morning span monotonic", () => {
    expect(nightAxis(toMin("22:00"))).toBeLessThan(nightAxis(toMin("06:00")) + DAY);
    expect(nightAxis(toMin("22:00"))).toBeLessThan(nightAxis(toMin("23:00")));
  });
  it("round-trips a tick label", () => {
    expect(nightTick(nightAxis(toMin("02:00")))).toBe("2a");
  });
});

describe("nightOf", () => {
  /* 22:00-07:00 shift, sleep 08:30 for 7.5h: wake lands 16:00 the next day. */
  const night = { start: 1320, sleepEnd: 2400 };

  it("names the night after the date its shift starts on", () => {
    // Mon 10 Aug 2026, 22:30 - half an hour into the shift
    expect(nightOf(night, new Date(2026, 7, 10, 22, 30)))
      .toEqual({ id: "2026-08-10", now: 1350 });
  });

  it("keeps a shift that crosses midnight on one night", () => {
    // Tue 02:00 is still Monday's night
    expect(nightOf(night, new Date(2026, 7, 11, 2, 0)))
      .toEqual({ id: "2026-08-10", now: 1560 });
  });

  it("keeps the post-shift sleep on the night it belongs to", () => {
    // Tue 15:00, an hour before the planned wake
    expect(nightOf(night, new Date(2026, 7, 11, 15, 0)))
      .toEqual({ id: "2026-08-10", now: 2340 });
  });

  it("rolls over exactly at the planned wake time", () => {
    // Tue 16:00 is sleepEnd: the new night starts here, not a minute later
    expect(nightOf(night, new Date(2026, 7, 11, 16, 0)))
      .toEqual({ id: "2026-08-11", now: 960 });
  });

  it("rolls back across a year boundary", () => {
    expect(nightOf(night, new Date(2026, 0, 1, 0, 30)))
      .toEqual({ id: "2025-12-31", now: 1470 });
  });

  it("collapses the boundary to midnight when the shift starts there", () => {
    // 00:00-08:00 shift waking 16:30: there is no previous night to fall back to
    const midnight = { start: 0, sleepEnd: 990 };
    expect(nightOf(midnight, new Date(2026, 7, 11, 2, 0)))
      .toEqual({ id: "2026-08-11", now: 120 });
  });

  it("caps the boundary at the next shift start", () => {
    // sleep planned so late it ends 23:00, an hour after the 22:00 shift begins
    const late = { start: 1320, sleepEnd: 2820 };
    expect(nightOf(late, new Date(2026, 7, 10, 22, 0)))
      .toEqual({ id: "2026-08-10", now: 1320 });
  });

  it("keeps the pre-shift block on the night it prepares for", () => {
    // 00:00-08:00 shift waking 16:30: 22:00 the evening before is pre-shift,
    // two hours ahead of a shift that starts at midnight
    const midnight = { start: 0, sleepEnd: 990 };
    expect(nightOf(midnight, new Date(2026, 7, 10, 22, 0)))
      .toEqual({ id: "2026-08-11", now: -120 });
  });
});

describe("forward", () => {
  /* Ids are zero-padded local dates, so lexicographic order is chronological
     order and a bare > is the whole rule. */
  it("advances to a later night", () => {
    expect(forward("2026-08-12", "2026-08-13")).toBe("2026-08-13");
  });

  it("refuses a backward step, which is the entire point", () => {
    // a shift-time edit can walk nightOf backward; the ref must not follow
    expect(forward("2026-08-13", "2026-08-12")).toBe("2026-08-13");
  });

  it("holds when the night has not changed", () => {
    expect(forward("2026-08-13", "2026-08-13")).toBe("2026-08-13");
  });

  it("seeds from undefined, which a bare > gets wrong", () => {
    /* boot.night is undefined on a fresh install and every relational
       comparison against undefined is false, so without the !cur clause the
       ref would stay undefined forever and the first night would be dropped
       on every reload. */
    expect(forward(undefined, "2026-08-13")).toBe("2026-08-13");
  });

  it("advances across a year boundary", () => {
    expect(forward("2026-12-31", "2027-01-01")).toBe("2027-01-01");
  });

  it("orders single-digit days correctly, because the ids are padded", () => {
    // "2026-08-9" > "2026-08-10" lexicographically; "2026-08-09" is not
    expect(forward("2026-08-09", "2026-08-10")).toBe("2026-08-10");
    expect(forward("2026-08-10", "2026-08-09")).toBe("2026-08-10");
  });
});
