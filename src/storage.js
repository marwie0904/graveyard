/* Everything the app remembers, in one key. try/catch on both sides is the
   trust boundary, not padding: Safari private browsing throws on setItem, and
   a corrupt entry would otherwise white-screen the app on boot. */
const KEY = "gy.v1";

/** Everything saved, or {} if there is nothing readable there. */
const load = () => {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
};

const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

/** Last night's blob keeps the profile and the theme; tonight's keeps everything.
    Dropping stale logs loses nothing a refresh does not already lose today, and
    it keeps last night's ticked items off tonight's plan.
    ponytail: Phase 2 replaces the drop with a fold into the archive, here. */
const forNight = (s, id) => (s.night === id ? s : { profile: s.profile, theme: s.theme });

export { load, save, forNight };
