import { foldNight } from "./stats.js";

/* Everything the app remembers, in one key. try/catch on both sides is the
   trust boundary, not padding: Safari private browsing throws on setItem, and
   a corrupt entry would otherwise white-screen the app on boot. */
const KEY = "gy.v1";

/** Everything saved, or {} if there is nothing readable there. */
const load = () => {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) ?? {} : {}; }
  catch { return {}; }
};

const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

/** Last night folded onto the front of the archive, newest first, which is the
    order every range slice in the app already assumes.
    dayOffset is dropped rather than stored: it is relative to tonight, so a
    stored one is wrong by morning and Dashboard.jsx would match every archived
    night against the strip's "Today" chip. Phase 3 computes it from the id.
    No night stamp means nothing to name the record; a night with neither logs
    nor a reflection has nothing to record. Both leave the archive alone, and
    the gap in the id sequence is the only trace an unworked night gets. */
export const archived = (s) => {
  const rec = s.night ? foldNight(s.profile, s.logs ?? [], s.reflection ?? {}) : null;
  if (!rec) return s.archive ?? [];
  const { dayOffset, ...night } = rec;
  return [{ ...night, id: s.night }, ...(s.archive ?? [])];
};

/** Last night's blob keeps the profile, the theme, and an archive one night
    longer; tonight's keeps everything. */
const forNight = (s, id) =>
  s.night === id ? s : { profile: s.profile, theme: s.theme, archive: archived(s) };

export { load, save, forNight };
