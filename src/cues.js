/* What the care player says and plays.

   The sequence expansion and the cue text live here rather than in the
   component so that coverage is testable without a browser: whether every step
   of every activity has something to say is a property of this file, whether
   the device actually speaks it is not.

   No audio files. A synthesised tone and the platform's own voice need no
   licence, no asset pipeline and no network round trip, which is the whole
   reason the cue is a tone rather than a sample. If ambient music is added
   later it becomes the first third-party asset in the project and needs a
   licence recorded beside it. */

export const DONE_CUE = "Done. That counts.";

/* A cycle activity repeats its pattern to fill the stated minutes; a step
   activity is already the whole sequence. */
export function sequenceOf(activity) {
  if (!activity.cycle) return activity.steps;
  const len = activity.cycle.reduce((a, c) => a + c.s, 0);
  const reps = Math.max(1, Math.round((activity.mins * 60) / len));
  return Array.from({ length: reps }).flatMap(() => activity.cycle);
}

export function cueFor(step) {
  return (step && typeof step.l === "string" ? step.l : "").trim();
}

let ctx = null;

/* ponytail: one oscillator per cue, with nothing but a fade in and out. A
   richer chime means a sample, and a sample means a licence to track. */
export function tone(hz = 528, ms = 160) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = ctx || new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    /* exponential ramps cannot touch zero, hence the near-silent endpoints */
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + ms / 1000 + 0.02);
  } catch {
    /* No audio device, or the browser has not seen a gesture yet. Silence is an
       acceptable outcome here: the visual guidance is the one that must work. */
  }
}

export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    synth.cancel(); // a new cue replaces the last one rather than queueing behind it
    synth.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* same: an unavailable voice is not a reason to stop the session */
  }
}

export function hush() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* same */
  }
}
