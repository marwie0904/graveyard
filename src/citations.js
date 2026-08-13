/* The keys `planner.js` cites, and nothing else. Not the bibliography — the full
   APA entries live in the paper's reference list and, for the design and
   engineering half, in docs/reference-integration.md §6.
   Each line records what docs/research-summary.md states about the source and no
   more. Do not add a volume, page range or DOI you have not read off the paper
   itself: a fabricated locator is the one failure this file exists to prevent,
   and this file would be the worst possible place for it.
   Nothing imports this at runtime. planner.js does not know it exists; its only
   importer is planner.test.js, which is what a certificate looks like. */
export const CITATIONS = {
  mchill2014: "McHill et al. (2014) — caffeine reliably boosts short-term alertness, but is a stimulant, not a circadian regulator.",
  burke2015: "Burke et al. (2015) — evening caffeine doses delay melatonin secretion and phase-delay the clock.",
  ruggiero2013: "Ruggiero & Redeker (2013) — naps reduce sleepiness and improve vigilance despite transient sleep inertia.",
  geigerbrown2016: "Geiger-Brown et al. (2016) — nap benefit, in the same finding.",
  oriyama2018: "Oriyama & Miyakoshi (2018) — nap benefit varies by timing and duration.",
  dallora2020: "Dall'Ora et al. (2020) — micro-breaks such as stretching and controlled breathing restore alertness without disrupting workflow.",
  tucker2018: "Tucker (2018) — the same finding.",
  cho2015: "Cho et al. (2015), Artificial Light Theory — blue-spectrum night light suppresses melatonin and shifts phase.",
  baron2015: "Baron & Reid (2015), Circadian Rhythm Theory — chronodisruption drives sleep, metabolic and cardiovascular risk.",
  owen2010: "Owen et al. (2010), Sedentary Work Hypothesis — prolonged sitting compounds those effects.",
  boivin2014: "Boivin & Boudreau (2014) — Shift Work Sleep Disorder affects nearly 40% of night workers, and tracks with anxiety, depression and chronic fatigue.",
  kervezee2022: "Kervezee et al. (2022) — 10% higher diabetes risk, 25–38% greater obesity likelihood, roughly 30% higher hypertension risk versus day workers.",
  wickwire2021: "Wickwire et al. (2021) — cognitive performance degrades with each consecutive night shift.",

  /* Not sources. They are read exactly like sources, which is why they live in
     the same object rather than in a second container: a separate table would
     buy one special case in the test for one saved line here, and §3 already
     settled that trade — "an explicit marker is cheaper to audit than a special
     case". */
  structural: "Not a recommendation. A navigational marker for a shift boundary.",
  judgement: "Design judgement, not evidence. No supporting study for this rule exists in the project's research corpus. Where study keys sit alongside this marker, they name the risk the rule addresses; they do not support the rule.",
};
