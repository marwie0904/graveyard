/* The keys `planner.js` cites, and nothing else. Not the bibliography: the full
   APA entries live in the paper's reference list and, for the design and
   engineering half, in docs/reference-integration.md §6.
   Each line records what docs/research-summary.md states about the source and no
   more. Do not add a volume, page range or DOI you have not read off the paper
   itself: a fabricated locator is the one failure this file exists to prevent,
   and this file would be the worst possible place for it.
   Nothing imports this at runtime. planner.js does not know it exists; its only
   importer is planner.test.js, which is what a certificate looks like. */
export const CITATIONS = {
  mchill2014: "McHill et al. (2014): caffeine reliably boosts short-term alertness, but is a stimulant, not a circadian regulator.",
  burke2015: "Burke et al. (2015): evening caffeine doses delay melatonin secretion and phase-delay the clock.",
  ruggiero2014: "Ruggiero & Redeker (2014): naps reduce sleepiness and improve vigilance despite transient sleep inertia.",
  geigerbrown2016: "Geiger-Brown et al. (2016): nap benefit, in the same finding.",
  oriyama2018: "Oriyama & Miyakoshi (2018): nap benefit varies by timing and duration.",
  albulescu2022: "Albulescu et al. (2022): micro-breaks reliably raise vigor and reduce fatigue. The performance effect is not significant overall, grows with break length, and varies by task.",
  tucker2003: "Tucker (2003): rest breaks reduce accident risk and blunt the fatigue and performance decrement that builds over a shift.",
  cho2015: "Cho et al. (2015), Artificial Light Theory: blue-spectrum night light suppresses melatonin and shifts phase.",
  baron2015: "Baron & Reid (2015), Circadian Rhythm Theory: chronodisruption drives sleep, metabolic and cardiovascular risk.",
  owen2010: "Owen et al. (2010), Sedentary Work Hypothesis: prolonged sitting compounds those effects.",
  boivin2014: "Boivin & Boudreau (2014): Shift Work Sleep Disorder is found in 2–5% of workers by the ICSD criteria.",
  boini2022: "Boini et al. (2022), umbrella review: roughly 10% higher diabetes risk, 25–38% greater likelihood of being overweight, roughly 30% higher hypertension risk versus day workers.",
  vlasak2022: "Vlasak et al. (2022): shift workers score below non-shift workers on cognitive control, working memory, psychomotor vigilance, visual attention and processing speed.",
  folkard2003: "Folkard & Tucker (2003): safety declines over successive night shifts, with hours on duty, and between rest breaks.",

  /* Not sources. They are read exactly like sources, which is why they live in
     the same object rather than in a second container: a separate table would
     buy one special case in the test for one saved line here, and §3 already
     settled that trade: "an explicit marker is cheaper to audit than a special
     case". */
  structural: "Not a recommendation. A navigational marker for a shift boundary.",
  judgement: "Design judgement, not evidence. No supporting study for this rule exists in the project's research corpus. Where study keys sit alongside this marker, they name the risk the rule addresses; they do not support the rule.",
};
