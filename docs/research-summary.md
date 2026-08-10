# Interactive Planner: A Circadian-Aware Planner for Night-Shift Workers

*Summary of Gabrella C. Ang, UP Open University, BA Multimedia Studies (29 December 2025) — "Timing Caffeine, Naps, and Micro-Care"*

## Problem and Purpose

The thesis opens from the author's own seven years on a call-center night shift and situates that experience in a global trend: the rise of 24-hour BPO, healthcare, and IT operations has pushed a large workforce into night work that is sedentary, screen-heavy, and biologically misaligned, producing chronodisruption (Vetter et al., 2016; Silvani et al., 2022). Its central claim is that the gap in the literature is not a shortage of countermeasures but a shortage of *timing* — caffeine limits, naps, and recovery breaks are documented as separate, broad recommendations rather than as coordinated behaviors governed by circadian phase, which leaves fatigued workers improvising under poor decision-making conditions. The study therefore aims to synthesize existing science into an interactive, circadian-aware planner, with four specific objectives:

- Identify the physical, mental, and cognitive risks of prolonged sedentary night shifts
- Study evidence-based caffeine, napping, and micro-care interventions
- Investigate how circadian timing interacts with the optimal moment for each intervention
- Translate the synthesis into a conceptual framework and design logic for the planner

## Evidence Base and Theoretical Grounding

The review assembles a consistent risk picture — Kervezee et al. (2022) report a 10% higher diabetes risk, 25–38% greater likelihood of obesity, and roughly 30% higher hypertension risk versus day workers, while Shift Work Sleep Disorder affects nearly 40% of night workers and tracks with anxiety, depression, and chronic fatigue (Boivin & Boudreau, 2014), and cognitive performance degrades with each consecutive night shift (Wickwire et al., 2021). Against that backdrop the three interventions are shown to be timing-dependent rather than universally good: caffeine reliably boosts short-term alertness (McHill et al., 2014) but is a stimulant, not a circadian regulator, and evening doses delay melatonin secretion and phase-delay the clock (Burke et al., 2015); naps reduce sleepiness and improve vigilance despite transient sleep inertia, with benefit varying by timing and duration (Ruggiero & Redeker, 2013; Geiger-Brown et al., 2016; Oriyama & Miyakoshi, 2018); and micro-breaks such as stretching and controlled breathing restore alertness without disrupting workflow (Dall'Ora et al., 2020; Tucker, 2018), yet almost no study specifies *when* in the shift to apply them. Four theories anchor the interpretation:

- **Demand-Control Model** (Karasek; de Jonge et al., 2000) — high demand plus low autonomy amplifies strain
- **Circadian Rhythm Theory** (Baron & Reid, 2015) — chronodisruption drives sleep, metabolic, and cardiovascular risk
- **Sedentary Work Hypothesis** (Owen et al., 2010) — prolonged sitting compounds those effects
- **Artificial Light Theory** (Cho et al., 2015) — blue-spectrum night light suppresses melatonin and shifts phase

## Method, Output, and Limits

The design is qualitative and design-oriented rather than experimental: peer-reviewed studies are screened, and their findings are extracted into a literature matrix organized by shift phase — pre-shift, mid-shift, and post-shift — so that timing principles can be compared across disciplines and converted into if-then decision rules driven by inputs such as sleep duration, shift start time, and reported fatigue. Those rules become a functional MVP prototype comprising a shift-based scheduling engine, a rule-based recommendation system, a notification and reminder component, a multimodal micro-care content player (text, audio breathing exercises, short movement videos, timelines), and action logging, deliberately scoped to essential features and the three shift phases. Validation stays archival — expert review and heuristic evaluation by specialists in sleep science, occupational health, HCI, and digital health design, plus a traceability check tying every feature to at least one supporting study and scenario-based testing against the synthesized rules — which sets the study's honest boundaries:

- No end-user testing, surveys, interviews, or trials with night-shift workers
- No claims about health improvement, behavior change, or application effectiveness
- No full accounting of individual chronotype variation or specific workplace conditions
