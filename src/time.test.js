import { describe, it, expect } from "vitest";
import { DAY, toMin, fmt, nextAfter, overlap, dur, nightAxis, nightTick } from "./time.js";

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
