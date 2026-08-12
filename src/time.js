export const DAY = 1440;
export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fmt = (abs) => {
  const m = ((abs % DAY) + DAY) % DAY;
  let h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const ap = h < 12 ? "AM" : "PM";
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${ap}`;
};
/** smallest absolute time >= anchor whose clock time is clockMin */
export const nextAfter = (anchor, clockMin) => {
  let t = Math.floor(anchor / DAY) * DAY + clockMin;
  while (t < anchor) t += DAY;
  return t;
};
export const overlap = (a, b) => {
  const s = Math.max(a[0], b[0]);
  const e = Math.min(a[1], b[1]);
  return e > s ? [s, e] : null;
};
export const dur = (mins) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

/* time helpers for charts: the night wraps midnight, so shift the axis by 12h
   to keep an evening-to-morning span monotonic */
export const nightAxis = (clockMin) => (clockMin + 720) % DAY;
export const nightTick = (v) => {
  const m = ((Math.round(v) % DAY) + DAY) % DAY;
  let h = Math.floor(((m + DAY - 720) % DAY) / 60);
  const ap = h < 12 ? "a" : "p";
  h %= 12; if (h === 0) h = 12;
  return `${h}${ap}`;
};

/** Which night the wall clock belongs to, and where that puts us on the plan's
    axis. The night is named by the date its shift starts on and rolls over at
    the plan's own wake time, so a shift crossing midnight is one night, not two.
    Wake is capped at the next shift start: a profile whose planned sleep runs
    past it must not file the first hour of a shift under the night before. The
    clock is placed by taking it modulo a full day around that wake boundary, so
    it can resolve forward into last night's arc or back into a pre-shift block
    that starts before midnight — `now` comes out negative there, which is the
    axis working as designed, not an error.
    ponytail: local dates throughout. toISOString would report the UTC date,
    which is the wrong night for half the world for part of every day. */
export function nightOf(ph, d = new Date()) {
  const clock = d.getHours() * 60 + d.getMinutes();
  const wake = Math.min(ph.sleepEnd, ph.start + DAY);
  const now = wake - DAY + ((((clock - wake) % DAY) + DAY) % DAY);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - Math.floor(now / DAY));
  const p = (n) => String(n).padStart(2, "0");
  return {
    id: `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`,
    now,
  };
}

/** The night id only ever moves forward. Ids are zero-padded local dates, so
    lexicographic order is chronological order and a bare `>` is the whole rule
    — no parsing, no Date.
    The first clause is load-bearing, not a null-check habit: `"2026-08-13" >
    undefined` is false for every string, so without it a fresh profile would
    never seed the ref at all, and would lose its first night on every reload. */
export const forward = (cur, next) => (!cur || next > cur ? next : cur);

/** Whole days from b to a, both "YYYY-MM-DD".
    Date.parse reads a bare date as UTC midnight, and UTC has no DST, so the
    difference is an exact whole number of days by construction. Parsing these
    into local Dates is what would introduce the trap, not avoid it: a local DST
    day is 23 or 25 hours, so a week across one measures 6.958 days. Math.round
    is therefore not a DST fix — it is there so a hand-edited id that lost its
    zero-padding still lands on an integer rather than a fraction that matches
    no chip. */
export const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
