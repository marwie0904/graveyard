# What the Paper Contains

`sample-paper.html` → clean draft (71 pp.) and annotated draft (102 pp., 37 margin comments). The full manuscript on the 2022 BAMS Special Project template: front matter (permission page, acceptance page, biographical sketch and acknowledgement placeholders, contents with generated page numbers, lists of tables/figures/appendices, abstract with keywords), Chapters I to V, one merged reference list of 42 entries, and two appendices. The circadian chapters as originally written are combined with the design, software-engineering and accessibility material, and every passage describing the artifact is stated against the build as of 18 August 2026.

**Template alignment.** Chapter II is now *Review of Related Literature* and carries Operational Definition of Terms and a Hypotheses section (none advanced, with the reason). Chapter III adds Locale of the Study and Sampling Procedure, both stating what replaces them in a study with no human respondents. Chapter IV opens with a profile of the assessed build in place of the template's socio-demographic profile of respondents. The contents pages are filled by a two-pass build: the clean PDF is printed once, `pdftotext` reports which page each heading landed on, and those numbers are written back before the final print.

---

## Chapter I. Introduction

Reproduced from the original manuscript: background (24-hour economies, sedentary night work, chronodisruption), statement of the problem (interventions studied separately, timing rarely specified, few planning tools), four objectives, significance, and scope.

**One addition.** The scope section now names the assessed build — four client-side screens (dashboard, plan, reflection, care), records held on the device — so that every later claim about "the prototype" has a fixed referent, and states that any feature specified but not implemented is identified where it is discussed.

---

## Chapter II. Study Framework

Reproduced from the original: health risks, the day-shift comparison, caffeine and circadian timing, napping and sleep inertia, micro-care interventions, and the four theories (Demand-Control, Circadian Rhythm, Sedentary Work, Artificial Light). The design half below follows them, and the conceptual framework now lists the design and accessibility literatures at its input level so the diagram describes the chapter it introduces.

**The hinge.** The circadian literature establishes *what* to recommend and *when*, not how to present it. Justified by the claim that "a highly-efficient system might still not be accepted if the interface is rejected by the users."

**Effectiveness in visual communication** (Goli-Cruz, 2023b). Five factors: relevance, clarity, visual appeal, inclusivity, language. Three are argued to bind a night-shift planner:

- *Relevance* → a plan that does not visibly respond to the user reads as generic advice. *Clarity* → guidance competing with a work task must be absorbable in a break. *Inclusivity* → shift length, break autonomy, and commute mode vary, so parameters are user-adjustable
- Timeline vocabulary: hierarchy (title vs. rationale), contrast (domain vs. domain), proximity (grouped by shift phase). Color and iconography treated as culturally situated, not universal, and routed to expert review

**Aesthetic grounding** (Heinrich, 2013; Dutton, 2005).

- Calm, low-contrast, non-gamified UI defended as a position: environments we find pleasing matter "because our well-being depends on it," extended to the digital environment of a worker already misaligned with their biology. Restraint defended against "make it more engaging": "making something ugly is not innovation"
- Blue and green are cross-culturally preferred, matching the hydration and movement hues
- Dutton cited **against** the study: evolutionary accounts explain the agreeable, not the beautiful, so they justify palette and calm but cannot settle fine compositional choices

**Content architecture** (DeRose et al., 1990). Plan items are an ordered hierarchy of content objects (identifier, time, category, instruction, rationale) with appearance resolved at render time. One item therefore renders as a timeline entry, a reminder, or an exported record without duplication, and adding audio or video later is a presentation change, not a data change.

### Application to the Support Screens *(new)*

**Micro-care screen**

- Five guided activities (two breathing, two movement, one eye-rest), one to four minutes each. Player: interval countdown, step name, pause control, progress, domain color and icon
- One marked **suggested**, chosen from shift phase plus logged events, not a fixed order: the relevance factor made operational. The other four stay selectable, so the suggestion narrows without removing choice
- **Declared gap:** guidance is timed visual instruction. Audio is specified but not built; movement sequences are timed text, not video

**Reflection screen**

- Two logging interfaces by design: *in-shift* (interrupted, "what is happening now") gives five events, each returning one sentence of consequence; *post-shift* (not interrupted, "what happened") gives thirteen event types, correctable times, editable entries. Clarity is thus a property of the moment, not of the application
- Returns two **derived readings**, not a bare list: the night's pattern read from the logs, and which plan items changed because of them. Visibility of consequence is a functional requirement
- Seven fixed-choice questions close the screen. **Only the last may write to the profile:** a preference about the plan may alter it, an observation about one night may not, or a single bad shift rewrites a standing profile

---

## Chapter III. Methodology

**Software development life cycle.** Prototype Model adopted (iterative, applicable when the customer "does not have yet specific details"), justified by three circumstances: requirements derived from literature not a client, a single researcher, and timing rules that must surface errors during construction. Waterfall rejected by quoting its own stated disadvantages. Iteration independently supported from the design side, giving a two-discipline justification.

**Requirements specification.** FR/NFR split adopted. Table 1 maps five quality attributes to mechanisms: usability (in-shift logging separated from post-shift reflection), reliability (unit tests over scheduling, statistics, time arithmetic), performance (plan generation as a pure function), security (local-only persistence), availability (client-side operation). Security is stated as a self-caught inconsistency: the *study* collects no data, the *application* records health information about an identifiable individual.

**Software design.** Four aspects (data, architectural, procedural, interface) and four modules, justified by the claim that complexity is module complexity plus integration complexity, and that complexity is cost. The rule set is both transform-centered and transaction-centered, the latter accounting for a skipped break, failed nap, or late caffeine dose altering later recommendations.

**Accessibility** *(expanded)*

- Framed as a functional requirement: "it is your responsibility to ensure that the digital products you produce are accessible to people of all abilities"
- **Central argument:** night-shift workers show measurable declines in cognitive control, working memory, psychomotor vigilance, visual attention and processing speed (Vlasak et al., 2022), and safety declines further across successive nights (Folkard & Tucker, 2003), so the interface faces constraints similar in kind to those accessibility standards address, differing only in origin. WCAG 2.2 Level AA adopted as a direct response to the study's own findings
- Guarded by the universal / inclusive / accessible design distinction: the claim is about design accommodating variable capacity, not about fatigue being a disability. Procedure named, not just the standard: POUR principles, preliminary review, then WCAG-EM conformance evaluation in its report format, scoped to implemented screens
- **Three findings, all closed:** (1) lowest-emphasis text failed 4.5:1 at 2.20:1 light and 3.17:1 dark against the surfaces it actually prints on, re-specified to 4.65:1 and 4.69:1 and guarded by a test over the whole palette; (2) eight domains by hue, two converge under deuteranopia, but each carries a distinct icon, so color is redundant not sole; (3) the scaling indicator has a pause control and the build honors the reduced-motion setting
- **A fourth finding, kept for what it shows about method:** domain hues used as text now carry a separate value calibrated for text, and the one instance that escaped both the palette review and the automated check was a color written into a component, found only by measuring rendered text against its actual background. An evaluation run against source alone inherits that blind spot
- **Table 2 lists five open findings** — three Level A (click targets that are not buttons, six unlabelled time controls, missing pressed and expanded states) and two AA (no screen-change announcement, empty-night labels at ~1.08:1). Two further items are declared rather than claimed: fixed type sizes, and the WCAG-EM report artifact
- One decision passes: the reflection screen uses native select controls with visible labels, inheriting keyboard, focus, and assistive-technology semantics

**Verification and validation.** Boehm's split: verification is the unit tests plus a traceability check run against citation identifiers stored on each plan item, so it executes against the running system rather than hand-maintained documentation. Validation is expert heuristic review plus scenario-based testing, legitimized as taught practice and explicitly *not* offered as equivalent to user testing. The instrument adapts an existing design-analysis rubric with numerical scoring removed.

**Limitations.** Testing "discloses the presence of bugs, but not their absence." Health-adjacent systems "should have a higher level of confidence," so expert review alone leaves residual risk. Acceptance testing is out of scope, so **no claim** is advanced about health outcomes or behavior change.

---

## Chapter IV. Results and Discussion *(new)*

*Scores below reflect the nine-section review pass of 18 August 2026, which rescored E2 to band 0 against the rubric's own descriptor.*

**The instrument.** An analytic rubric built for this study, since no published scale covers this combination of properties. Domain structure adapted from the **Mobile App Rating Scale** (Stoyanov et al., 2015), still in active validation (Chen et al., 2025: α = .84, ICC .68–.86); engagement dropped as inappropriate to the artifact, accessibility added because Ch. III makes conformance a requirement. Analytic rather than holistic because analytic marking narrows examiner disagreement (Yeo et al., 2024); criteria state the property rather than a quality word (Brookhart, 2018) and descriptors are written to be re-applied by a second rater (Dawson, 2017). Multimedia domain grounded in meta-analytic evidence (Noetel et al., 2022; Cromley & Chen, 2025).

**Shape.** 5 domains × 4 criteria = 20 criteria, equal weights fixed before scoring, 60 points. Bands 0–3, and **band 3 requires confirmation independent of the researcher** — a measurement against a published threshold, a passing test, or a standard's success criterion. Six anti-bias safeguards, including: evidence required or the lower band is taken, measurements override judgement, and a specified-but-unbuilt feature cannot exceed band 0. Self-assessment bias is declared and cited (Deffuant et al., 2024), not waved off.

**Result: 36 / 60.** Communication effectiveness 10, Interaction and usability 10, Visual design 8, Multimedia instruction 5, Accessibility 3. Four band-3 scores, all test-backed (relevance, inclusivity, error prevention, reliability); two band 0 (modality, since there is no audio or video, and keyboard operability, since the care screen cannot be reached without a pointer). Every criterion reported with its evidence in Table 6, so any score can be re-checked.

**Also reported.** Traceability (25 construction sites, all cited; 10 marked design judgment; 2 navigational; 13 resting on a study) and automated verification (182 assertions, 12 modules). The discussion says plainly what the numbers mean: the timing logic is the strong half, delivery is the weak half, and 36/60 is criterion-referenced, so it supports no comparison to any other app.

## Chapter V. Summary, Conclusion, and Recommendations *(new)*

Summary against each of the four objectives; conclusions that the evidence-to-artifact link is enforced rather than asserted, that the weaknesses sit in delivery rather than logic, and that no claim about health outcomes is available. Five recommendations, ordered: close the three Level A findings, produce the WCAG-EM report, build reminder delivery, add the audio modality, then have the expert panel re-score the same rubric and report the divergence.

## Appendices *(new)*

**A.** The full rubric — 20 criteria, four band descriptors each, by domain. **B.** Scoring evidence record: interface inventory, contrast measurements, keyboard reachability, labelling and state-reporting failures, traceability counts, test coverage, and the declared-not-built list.

---

## In the Paper, Not Yet in the App

Full detail in `docs/paper-vs-build.md`.

**Declared in the paper** (honest as written, only needs building)

- **Audio breathing guidance.** No audio anywhere in `src/`. The player is silent; guidance is visual and timed
- **Reminders and notifications.** No Notification API, no service worker, no scheduling. `REMINDERS` is a list of labels used in copy, not a delivery mechanism. Now declared in Ch. III under *Prototype development*: four of the five MVP components are present, this one is specified and unbuilt
- **Video.** Movement sequences are timed text. Declared in Ch. II and again in Ch. III under *Design of interaction and multimodal content*
- **Text scaling.** Type sizes are fixed; declared in the accessibility section as a direction, not a feature
- **The five open accessibility findings** in Table 2, and the WCAG-EM artifact

**Undeclared** (reads as though it exists, so it can be challenged)

- **Movement videos in the other docs.** The paper no longer claims them, but `docs/research-summary.md` still says "short movement videos" and needs the same edit

**Described but not yet performed.** Expert heuristic review, scenario-based testing, the adapted evaluation instrument, and the WCAG-EM report artifact. The unit tests and the traceability check are real and passing.

**Smaller.** The five micro-care activities carry no citation keys, so they sit outside the traceability check that plan items are subject to. The functional requirement list, use-case diagram, and creative brief do not exist. `Esteves (2025)` may need to be 2026: the guide's own schedule runs June to September 2026.

**Sources replaced, 18 August 2026.** Two citations inherited from the original manuscript did not support the claims made on them, and both were swapped for verified, better-matched work. `Wickwire et al. (2021)` carried a DOI belonging to an unrelated insomnia meta-analysis; the cognition claim now rests on **Vlasak et al. (2022)**, a meta-analysis of 18 studies and 18,802 participants reporting worse shift-worker performance on cognitive control, working memory, psychomotor vigilance, visual attention and processing speed, with **Folkard & Tucker (2003)** for the decline across successive nights. `Dall'Ora et al. (2020)` is a theoretical review of burnout, not a study of rest breaks; the micro-break claim now rests on **Albulescu et al. (2022)**, a meta-analysis of 22 samples that found vigor and fatigue improved reliably while the performance effect was not significant overall. The app's `citations.js` keys were renamed to match, and `tucker2018` became `tucker2003` after the year was corrected against the record.

**Reference list.** One merged alphabetical list of 32 entries: the 18 circadian and occupational health sources from the original manuscript plus the 14 design, engineering and accessibility sources introduced by this integration.

**Sources introduced here.** DeRose et al. (1990), Dutton (2005), Heinrich (2013); W3C WCAG 2.2 (2023) and WCAG-EM 1.0 (2014); Clariño (2024), Esteves (2025), Goli-Cruz (2023a–c), UPOU (2023a–d). APA 7, no em dashes.
