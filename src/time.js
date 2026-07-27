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
