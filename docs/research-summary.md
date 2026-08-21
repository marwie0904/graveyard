# Interactive Planner: Circadian-Aware Planner for Night-Shift Workers

*Summary of Gabrella C. Ang, UP Open University, BA Multimedia Studies (20 August 2026) — "Timing Caffeine, Naps, and Micro-Care"*

## Problem and Purpose

The thesis opens from the author's own eight years of night-shift work, four of them at a call center, and situates that experience in a global trend: the rise of 24-hour BPO, healthcare, and IT operations has pushed a large workforce into night work that is sedentary, screen-heavy, and biologically misaligned, producing chronodisruption (Vetter et al., 2016; Silvani et al., 2022). Its central claim is that the gap in the literature is not a shortage of countermeasures but a shortage of *timing* — caffeine limits, naps, and recovery breaks are documented as separate, broad recommendations rather than as coordinated behaviors governed by circadian phase, which leaves fatigued workers improvising under poor decision-making conditions. The study therefore aims to synthesize existing science into an interactive, circadian-aware planner, with four specific objectives:

- Identify the physical, mental, and cognitive risks of prolonged sedentary night shifts
- Study evidence-based caffeine, napping, and micro-care interventions
- Investigate how circadian timing interacts with the optimal moment for each intervention
- Translate the synthesis into a conceptual framework and design logic for the planner

## Evidence Base and Theoretical Grounding

The review assembles a consistent risk picture — Boini et al. (2022) report a 10% higher diabetes risk, a 25–38% greater likelihood of *overweight* (obesity itself is 5% on night and 18% on rotating schedules), and roughly 30% higher hypertension risk versus day workers, while Shift Work Sleep Disorder affects 2–5% of workers (Boivin & Boudreau, 2014), and night and shift workers score below day workers on cognitive control, working memory, psychomotor vigilance, visual attention, and processing speed (Vlasak et al., 2022), with safety declining further across successive night shifts (Folkard & Tucker, 2003). Against that backdrop the three interventions are shown to be timing-dependent rather than universally good: a single caffeine dose raises subjective alertness (McHill et al., 2014) but caffeine is a stimulant, not a circadian regulator, and evening doses delay melatonin secretion and phase-delay the clock (Burke et al., 2015); naps reduce sleepiness and improve vigilance despite transient sleep inertia, with benefit varying by timing and duration (Ruggiero & Redeker, 2014; Geiger-Brown et al., 2016; Oriyama & Miyakoshi, 2018); and micro-breaks raise vigor and reduce fatigue, with the effect on task performance not significant overall and growing with the length of the break (Albulescu et al., 2022; Tucker, 2003), yet almost no study specifies *when* in the shift to apply them. Four theories anchor the interpretation:

- **Demand-Control Model** (Karasek; de Jonge et al., 2000) — high demand plus low autonomy amplifies strain
- **Circadian Rhythm Theory** (Baron & Reid, 2015) — chronodisruption drives sleep, metabolic, and cardiovascular risk
- **Sedentary Work Hypothesis** (Owen et al., 2010) — prolonged sitting compounds those effects
- **Artificial Light Theory** (Cho et al., 2015) — blue-spectrum night light suppresses melatonin and shifts phase

## Method, Output, and Limits

The design is qualitative and design-oriented rather than experimental: peer-reviewed studies are screened, and their findings are extracted into a literature matrix organized by shift phase — pre-shift, mid-shift, and post-shift — so that timing principles can be compared across disciplines and converted into if-then decision rules driven by inputs such as sleep duration, shift start time, and reported fatigue. Those rules become a functional MVP prototype specified as five components: a shift-based scheduling engine, a rule-based recommendation system, a notification and reminder component, a multimodal micro-care content player, and action logging, deliberately scoped to essential features and the three shift phases. Four of the five are present in the assessed build. The notification and reminder component is not — the prototype composes and displays the reminder schedule but has no means of alerting a user who is not looking at it, and it is recorded as specified and unbuilt. The content player carries text steps, spoken and tone cues, and an interval countdown; the movement sequences are still text, since the video rendering has not been built. The three shift phases of the literature matrix are resolved by the scheduling engine into six named intervals. Assessment has reached only its first stage: verification is complete — 285 assertions across twenty-two automated modules, plus a traceability check confirming that every generated plan item either names the evidence behind it or records that it rests on design judgment — and validation so far is the researcher's own application of a twenty-criterion analytic rubric, which scored the build 50 of 60. The expert heuristic review by specialists in occupational health, sleep science, HCI, or digital health design, and the scenario-based testing against the synthesized rules, are specified but had not been carried out when the report was prepared. The study's honest boundaries follow:

- No end-user testing, surveys, interviews, or trials with night-shift workers
- No claims about health improvement, behavior change, or application effectiveness
- No full accounting of individual chronotype variation or specific workplace conditions
