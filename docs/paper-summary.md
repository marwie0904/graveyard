# What the Paper Contains

`sample-paper.html` → clean draft (14 pp.) and annotated draft (23 pp., 27 margin comments). Two chapter excerpts, not the full manuscript: Chapter II's design-foundations half, Chapter III's development and validation half. Circadian content from Chapters I and II is referenced, not reproduced.

---

## Chapter II. Study Framework

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
- **Central argument:** night-shift workers show measurable declines in attention, working memory, and response inhibition (Wickwire et al., 2021), so the interface faces constraints similar in kind to those accessibility standards address, differing only in origin. WCAG 2.2 Level AA adopted as a direct response to the study's own findings
- Guarded by the universal / inclusive / accessible design distinction: the claim is about design accommodating variable capacity, not about fatigue being a disability. Procedure named, not just the standard: POUR principles, preliminary review, then WCAG-EM conformance evaluation in its report format, scoped to implemented screens
- **Three findings, two open:** (1) lowest-emphasis text fails 4.5:1, measured 2.51:1 light and 3.17:1 dark, **open**; (2) eight domains by hue, two converge under deuteranopia, but each carries a distinct icon, so color is redundant not sole, **closed**; (3) micro-care animates a scaling indicator, a pause control satisfies the moving-content criterion but reduced-motion is not honored, **open**
- One decision passes: the reflection screen uses native select controls with visible labels, inheriting keyboard, focus, and assistive-technology semantics

**Verification and validation.** Boehm's split: verification is the unit tests plus a traceability check run against citation identifiers stored on each plan item, so it executes against the running system rather than hand-maintained documentation. Validation is expert heuristic review plus scenario-based testing, legitimized as taught practice and explicitly *not* offered as equivalent to user testing. The instrument adapts an existing design-analysis rubric with numerical scoring removed.

**Limitations.** Testing "discloses the presence of bugs, but not their absence." Health-adjacent systems "should have a higher level of confidence," so expert review alone leaves residual risk. Acceptance testing is out of scope, so **no claim** is advanced about health outcomes or behavior change.

---

## In the Paper, Not Yet in the App

Full detail in `docs/paper-vs-build.md`.

**Declared in the paper** (honest as written, only needs building)

- **Audio breathing guidance.** No audio anywhere in `src/`. The player is silent; guidance is visual and timed
- **Contrast remediation.** `faint` tokens unchanged: 2.51:1 light, 3.17:1 dark
- **Reduced motion.** No `prefers-reduced-motion` guard; the micro-care indicator animates regardless

**Undeclared** (reads as though it exists, so it can be challenged)

- **Reminders and notifications.** No Notification API, no service worker, no scheduling. `REMINDERS` is a list of labels used in copy, not a delivery mechanism. Largest gap, and the premise of the thesis is timing
- **Domain hue as small text.** The micro-care duration label measures 3.94:1; other hues on the light card fall to 2.30:1. A fourth real finding the audit paragraph does not mention
- **Movement videos.** Claim removed from the paper, but `docs/research-summary.md` still says "short movement videos" and needs the same edit

**Described but not yet performed.** Expert heuristic review, scenario-based testing, the adapted evaluation instrument, and the WCAG-EM report artifact. The unit tests and the traceability check are real and passing.

**Smaller.** The five micro-care activities carry no citation keys, so they sit outside the traceability check that plan items are subject to. The functional requirement list, use-case diagram, and creative brief do not exist. `Esteves (2025)` may need to be 2026: the guide's own schedule runs June to September 2026.

**Sources introduced here.** DeRose et al. (1990), Dutton (2005), Heinrich (2013); W3C WCAG 2.2 (2023) and WCAG-EM 1.0 (2014); Clariño (2024), Esteves (2025), Goli-Cruz (2023a–c), UPOU (2023a–d). APA 7, no em dashes.
