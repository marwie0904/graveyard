# Using Past Course Materials as References in the Graveyard Thesis

A mapping from `~/Downloads/Graveyard_References` into the app's design, backend, and methodology chapters — with verbatim quotable material, APA entries, and the reason each one earns its place.

---

## 0. Why this works at all (read this first)

Your thesis methodology already promises this:

> "a **traceability check** will be performed to ensure that each application feature corresponds to at least one supporting study."
> — *Interactive Planner* thesis, Methodology → Validation of the Application

Right now that promise is only pointed at the **circadian literature** (Burke, Oriyama, Albulescu, etc.), which justifies *what the app recommends*. It does not justify *how the app was built or how it looks* — and a Multimedia Studies panel will ask exactly that. Your six prior courses cover that second half:

| Question a panelist will ask | Course that answers it |
|---|---|
| Why this development process, not a survey study? | MMS 149 (Software Engineering) |
| Why these screens, this flow, this prototype fidelity? | MMS 150 (UI/UX) |
| Why these colors, this hierarchy, this layout? | MMS 174 (Graphics) + MMS 170 (Aesthetics) |
| Why is content stored this way and rendered that way? | MMS 171 (Text in Multimedia) |
| Who gets excluded by this design? | MMS 151 (Web Accessibility) |

The codebase already has the hook. Every item in `src/planner.js` carries a `why:` string:

```js
why: "Caffeine is a short-term alertness tool rather than a substitute for sleep,
      so used early it costs nothing and used late it is still active when you lie down.",
```

**Concrete suggestion:** extend that object with a `src:` field holding citation keys, so the traceability check becomes a script rather than an appendix you maintain by hand.

```js
{
  id: "caff-cutoff",
  why: "Caffeine takes hours to clear, so stopping now leaves time…",
  src: ["burke2015", "mchill2014"],          // evidence for the recommendation
  designSrc: ["goliCruz2023m2", "wcag22"],   // evidence for how it is presented
}
```

One pass over `generateTimeline()` then prints your traceability matrix. No feature can ship without a citation, which is precisely the claim your Methodology chapter makes.

---

## 1. Design of the app

### 1.1 MMS 150 — UI/UX Design → *the design process itself*

**APA**
> Clariño, M. K. (2024). *MMS 150: User interface and user experience design* [Course syllabus, A.Y. 2024–2025]. University of the Philippines Open University, Faculty of Information and Communication Studies.

**Quotable material** (verbatim, from the syllabus objectives)

> "Create user interfaces based on **heuristic and human-centered principles**"
> "**Evaluate a user interface using heuristics and usability tests**"
> "Anticipate considerations in designing future-facing user interfaces."

And the course structure itself is a citable artifact — the schedule is explicitly labelled with the Design Thinking stages:

> "I. User interface design and user experience research (**Empathize**) → II. Elements of a UI (**Define**) → III. Prototyping and Creating UIs (**Ideate**) → III. Prototyping and Creating UIs (**Prototype**) → IV. Evaluating UIs (**Test**)"

**Why it's relevant**
This is the single most load-bearing reference you have, because it retroactively legitimises the one methodological choice most likely to be challenged: *you validate by expert heuristic review instead of user testing.* MMS 150 teaches heuristic evaluation as a first-class UI evaluation method, not a fallback. Cite it and the choice becomes disciplinary practice rather than a shortcut.

**Drop-in sentence for Chapter 3**
> Heuristic evaluation is an established interface assessment method in multimedia practice, taught as a core evaluation technique alongside usability testing (Clariño, 2024); its use here is therefore a deliberate methodological selection appropriate to a prototype whose scope excludes end-user trials, rather than a substitute for them.

**Also in this folder — two lecture recordings** you can cite as course lectures:

> Clariño, M. K. (2024). *Evaluating user interfaces and UX design benefits* [Audio lecture, 8 min 49 s]. MMS 150, University of the Philippines Open University.
>
> Clariño, M. K. (2024). *High-fidelity prototyping with Figma* [Audio lecture, 9 min 43 s]. MMS 150, University of the Philippines Open University.

⚠ I could not transcribe the `.wav` files. Play them and pull 2–3 timestamped quotes — the "UX design benefits" one almost certainly contains a defensible line about *why* interface quality affects product adoption, which is the exact claim your Significance section makes without support. Cite with timestamps, e.g. `(Clariño, 2024, 3:15)`.

---

### 1.2 MMS 174 — Graphics → *elements, principles, and the creative brief*

**APA**
> Goli-Cruz, M. J. (2023). *Module 2: Graphic design elements and principles* [Study guide]. MMS 174: Graphics in Multimedia, University of the Philippines Open University.
>
> Goli-Cruz, M. J. (2023). *Module 4: The graphic design process* [Study guide]. MMS 174: Graphics in Multimedia, University of the Philippines Open University.

*(Author confirmed — Study Guide 3 carries the running head "Goli-Cruz, MJ (2023). MMS174. Los Baños: University of the Philippines Open University", and Module 4's own reference list self-cites as "Goli-Cruz, M. (2023).")*

**Quotable material — the five factors of effective visual communication** (Module 4, Discussion). This is the strongest single passage in the whole folder for your Design chapter, because factors 1–4 map one-to-one onto design decisions already in the code:

> "1) **Relevance** of the information being shared to the audience. We tend to give more attention to messages/information that we think can impact our lives…
> 2) **Clarity** of the message being shared. As there is limited time (for video) and space (for static visual material), the message should be concise and direct to the point.
> 3) The **visual appeal** of a communication material impacts the attention, engagement, and emotion of the target audience. Factors such as color, composition, typography, images used, among others contribute to the overall visual appeal…
> 4) **Inclusivity** of the material, which not only refers to the accessibility of the informational material but also considers the diverse needs, perspectives, experiences, and characteristics of the audience, thus foster a sense of belonging and representation.
> 5) The **language used**. Language is not merely a set of spoken or written words; it embodies a rich tapestry of shared culture, experiences, and traditions…"

**Where each lands in the repo**

| Factor | Design decision it justifies |
|---|---|
| Relevance | The `changed:` field — every plan item that mutates explains *why it changed for you tonight* ("Shortened because you skipped the last one.") |
| Clarity | The commit history literally reads `7 explainers to 3, drop dead copy` and `quick log down to the five events that change the plan`. That was clarity work. Now it has a citation. |
| Visual appeal | `src/tokens.js` — the eight-hue `DOMAIN` map and the `WARM`/`DARK` themes |
| Inclusivity | The `DARK` theme is not a preference toggle, it is an accessibility feature for a user reading at 03:00 (see §3) |

**Quotable material — the elements/principles vocabulary** (Module 2, Discussion). Use this to *name* what you already built instead of describing it informally:

> "The **elements of design** — color, typography, line, space, shape, texture, and depth — are necessary components of a visual material."
>
> "The **principles of design**, which provide a framework for organizing and arranging the elements in a harmonious and pleasing composition, includes balance, contrast, emphasis, hierarchy, movement, pattern, proportion, repetition, and unity."

Module 2 also summarises Hayward-Cole's principles in a form you can quote directly for the timeline UI:

> "**Hierarchy** is about giving importance to certain element/s in a design. **Contrast** guides the viewer's attention to key elements. … **Proximity** organizes the design by creating a relationship between related elements."

That is a textual description of your timeline: hierarchy = the priority commute card, contrast = domain hue against a neutral card, proximity = items grouped by shift phase.

**Quotable material — visual codes are cultural** (Module 2):

> "Visual codes are important aspects of visual design as they can convey meanings that are **culturally bound** (the beliefs, attitudes, norms, behavior, and values shared by a group of people). Knowing your audience is an important consideration when developing your graphic design."

**Why it matters specifically to Graveyard:** your target users are Philippine BPO workers. A red "stop" semantic and a moon-for-sleep icon are not culturally neutral defaults — this quote lets you say you *considered* that, which is a limitation a panelist can otherwise raise unanswered.

**Quotable material — the creative brief** (Module 4, citing Santoro):

> "According to Santoro (2014) a Creative brief is a document that explains the goals, audience, and main message of a project. It gives the designer a clear and concise overview of the project and is an important tool for making sure the final design meets the client's expectations."

Components listed: *Background and context · Objectives · Audience · Key messages · Design requirements · Timeline and budget · Additional information.*

**Concrete suggestion:** write the Graveyard creative brief as an appendix using exactly those seven headings. It costs you two pages, it makes your design chapter reproducible, and it answers "what was your design specification?" with a document instead of a paragraph.

**Quotable material — design is iterative** (Module 4):

> "graphic designing is an iterative process. It is a reality that before a graphic design is approved, produced, and used, revisions after revisions may happen."
>
> "Going straight to production without careful preparation and planning is generally not recommended. It might be tempting to dive directly into creating visuals, but there are steps in the design process that should be undertaken before moving to production so as not to waste human and non-human resources."

This pairs with MMS 149's Prototype Model (§2.1) to give you a *two-discipline* justification for the same iterative choice — one from design, one from engineering. That is a genuinely strong move in a Multimedia Studies thesis, which sits between both.

**Bonus: the FMA2 rubric is a ready-made validation instrument.**
Your Methodology says you need "a structured evaluation guide … focused on qualitative judgements rather than numerical scoring." The MMS 174 rubric is already shaped for that:

> Goli-Cruz, M. J. (2023). *Rubrics for MMS 174 assessment tasks* [Assessment rubric]. MMS 174: Graphics in Multimedia, University of the Philippines Open University.

> "1. Introduction — the context of the analysis; background information about the graphic design, including its purpose. 2. **Design Analysis** — enumerate the visual elements used; enumerate the principles of design used; enumerate what principles of design used were violated. 3. **Effectiveness** — evaluate the design, considering its effectiveness in achieving its intended purpose and message by discussing the strengths and weaknesses. 4. **Conclusion** — insights why the design is successful or unsuccessful; provide 3 or more suggestions on how it can be improved."

Adapt those four criteria into your expert evaluation form, drop the point values, and cite the source. You get an instrument with academic provenance instead of one you invented at submission time.

---

### 1.3 MMS 170 — Aesthetics → *why the interface should be calm, and where beauty stops*

Two genuinely peer-reviewed sources here. These are your strongest citations for the aesthetic chapter because they are external scholarship, not course handouts.

**APA**
> Heinrich, B. (2013). The biological roots of aesthetics and art. *Evolutionary Psychology, 11*(3), 743–761. https://journals.sagepub.com/home/evp
>
> Dutton, D. (2005). Aesthetics and evolutionary psychology. In J. Levinson (Ed.), *The Oxford handbook of aesthetics* (pp. 693–705). Oxford University Press.

*(MMS 170 itself: Vega, J. M. M. (2023). MMS 170: Aesthetics in Multimedia [Course guide, 3rd Trimester A.Y. 2022–2023]. UPOU. The outline's "Biological Perspective" section is where both readings sit.)*

**Heinrich — the environment/well-being argument** (p. 752). This is the quote that ties your aesthetics chapter to your *health* thesis, and it is the reason MMS 170 belongs in this document at all:

> "If aesthetic tastes refer to adaptive responses to living in a certain environment, then this suggests that we should make efforts to **retain and create environments that we find beautiful and pleasing because our well-being depends on it**."

**Why it's relevant:** your entire thesis argues that night-shift workers are in an environment misaligned with their biology. Heinrich lets you argue that the *interface* is part of that environment — that a calm, dark, low-contrast-at-night UI is not decoration but a small correction to a hostile setting. That is the bridge between MMS 170 and your circadian literature, and no other source in the folder provides it.

**Heinrich — color contrast and the aural landscape** (p. 752):

> "Thus, it is no wonder that we have an **aesthetic sense for color contrasts**, one widely exploited by artists… But that aesthetic environment includes not only our visual cues but also an **aural landscape**."

Use the second half to justify the audio breathing exercises in your multimodal micro-care content — you currently justify audio only as "reduced cognitive load," which is a UX claim; Heinrich gives you an aesthetic-biological one too.

**Heinrich — the limit on novelty** (p. 755). Quote this to defend a *restrained* interface against "make it more engaging" feedback:

> "Translated to art, this tendency means that the 'new' catches our eye and so variety and complexity as such may be aesthetic. But… **there are discrete limits to the novel that are beautiful. Making something ugly is not innovation.**"

**Heinrich — attention and arousal** (p. 757):

> "**Learning occurs only with emotional arousal**, and originally that arousal comes from our innate aesthetic roots where the relevant catches our attention."

This is your justification for the `priority: true` flag on the drive-home card in `planner.js` — the one item with no skip button. The visual emphasis is doing cognitive work, not decorative work.

**Dutton — blue and green, worldwide** (p. 698):

> "**Blue turned out to be the favourite colour worldwide, with green in second place.** Respondents expressed a liking for realistic representative paintings. Preferred elements included water, trees and other plants, human beings…"

Set against `src/tokens.js`: water is `#2C9FD4` (blue), movement is `#2FA96B` (green). Whether that was deliberate or intuitive, Dutton lets you defend it as a cross-culturally robust choice rather than personal taste — which matters for a Philippine user base evaluated by international literature.

**Dutton — the Swiss army knife** (p. 696), for your Theoretical Framework:

> "Evolutionary psychology replaces the blank slate as a metaphor for mind with the **Swiss army knife**: the mind is a set of tools and capacities specifically adapted to important tasks and interests."

This sits well beside your existing Circadian Rhythm Theory: both say the same structural thing — human capacities are evolved and specific, and fighting them has a cost. Night-shift work fights the clock; a bad interface fights attention.

**Dutton — the honest limitation** (p. 703). Cite this one *against yourself*; panels reward it:

> "Kant distinguished what he called **the agreeable from the beautiful**. The agreeable are the straightforward subjective sensations of things that we like in direct experience: the taste of sweet, for example, or the colour blue… For Kant, the disinterested experience that characterizes the proper regard for art is cut off from desires."
>
> "if we want to know what distinguishes a popular calendar landscape from a great landscape painting by Constable, there may be nothing much to help us in a theory of Pleistocene landscape preferences."

**Drop-in sentence for Limitations:**
> Evolutionary accounts of aesthetic preference (Dutton, 2005; Heinrich, 2013) can justify broad choices such as palette and visual calm, but Dutton's own caution — that such accounts explain the agreeable rather than the beautiful — means they cannot adjudicate finer compositional decisions, which were instead settled by the design principles in Goli-Cruz (2023) and by expert review.

---

### 1.4 MMS 171 — Text in Multimedia → *typography, hierarchy, and the grid*

**APA**
> Vega, J. M. M. (2023). *MMS 171: Text in Multimedia* [Course guide, 1st Trimester A.Y. 2023–2024]. University of the Philippines Open University, Faculty of Information and Communication Studies.

**Quotable material** — the course outline is itself the argument, and one line does a lot of work:

> "II. The Bridge — a. **Content = Structure + Meaning** — b. Hypertext — c. Role of Text in Multimedia
> III. Practice — a. Content and Copy — b. Elements of Typographic Style — c. **Hierarchy** — d. **The Grid System**"

**Why it's relevant:** Graveyard is an overwhelmingly *textual* product. Every timeline item is a `title` + `msg` + `why` + optional `changed` — four levels of text hierarchy in a single card. That is a typographic hierarchy problem, and `src/tokens.js` already declares `FONT_DISPLAY` and `FONT_TEXT` as separate stacks. Cite MMS 171 and that becomes a documented decision.

---

## 2. Backend of the app

### 2.1 MMS 149 Module 1 — SDLC → *why a prototype, and why iterative*

**APA**
> *Module 1: Software development basics* [Course module]. (2023). MMS 149: Software Engineering in Multimedia Practice, University of the Philippines Open University.

⚠ **Metadata gap:** the five module PDFs carry no author line. The 2T 2023–2024 course guide lists the faculty-in-charge as **Rosangela Anne Salaya** (rosangelaanne.salaya@upou.edu.ph), but the modules are headed "2nd Trimester 2022–2023" — a different term, possibly a different FIC. Email UPOU FICS to confirm authorship before you finalise the reference list; otherwise cite as a corporate/anonymous work as above.

**Quotable material — the Prototype Model.** This is the *exact* description of what you did:

> "As the name implies, the prototype model focuses on developing a prototype version of the project. **This model is applicable if the customer does not have yet specific details about the software they want to have.** The developer can start developing a prototype with minimal information and present it to clients for their feedback. Thereafter, necessary changes will be applied based on clients' comments and suggestions. This model is considered iterative."

**Why it's relevant:** your thesis currently calls its method "qualitative, design-oriented" and cites Domínguez (2017). That describes the *research* stance but not the *engineering* one, and a panelist can reasonably ask "what SDLC did you follow?" This answers it in the vocabulary the question will be asked in.

⚠ *Correction, 20 Aug 2026.* The Domínguez citation itself does not hold. The thesis cites it to justify a design that "draws on existing knowledge rather than on the collection of new data," but Domínguez defines design-based research as designing innovations and **testing them in naturalistic settings** — inherently data-collecting. That is the citation holding up the whole no-user-testing stance, so the Module 1 material below is not a supplement to it, it is the replacement for it: the prototype model is the honest description of what was done. See the audit of 20 August 2026, §2.6.

**Quotable material — model selection is contingent:**

> "Considering that each of the aforementioned SDLC models offers unique processes that best suit the adversity of Software Development challenges, **finding the right one greatly depends on the circumstances and factors including but not limited to the scope of the project, size of the team, budget, and client preferences.**"

**Drop-in paragraph for Chapter 3:**
> Development followed the Prototype Model, which is indicated where detailed requirements are not fixed in advance and a working artifact is used to elicit feedback (MMS 149 Module 1, 2023). The model's fit is contingent on project scope, team size, and budget; for a single-researcher prototype whose requirements are derived from literature rather than a client, its iterative trial-and-error cycle is more appropriate than the Waterfall model's requirement that all specifications be settled before design begins.

**Quotable material — Waterfall's disadvantages,** to justify *not* choosing it:

> "Idealistic and unrealistic · Does not support iterative development · **Output is delivered late, severe errors were not detected early** · Risk management is complicated to incorporate"

---

### 2.2 MMS 149 Module 3 — Requirements Engineering → *the strongest backend citation you have*

**APA**
> *Module 3: Requirements engineering* [Course module]. (2023). MMS 149: Software Engineering in Multimedia Practice, University of the Philippines Open University.

**Quotable material — functional vs. non-functional:**

> "**Functional requirements** — What the system should do, what functionalities and features are, what are the actions to be performed…
> **Nonfunctional requirements** — What are the general properties of the system aside from the functionalities. These are also known as **quality attributes**… these provide directions and restrictions to the overall system architecture."

**Quotable material — the quality attributes, verbatim.** Each maps onto something real in your repo:

| Quote from Module 3 | Where it lands in Graveyard |
|---|---|
| "**Usability** refers to the easiness of learning and operating the system from the perspective of the end-users… **intuitiveness** (easiness to understand the purpose of buttons and the likes with mere intuition)." | The quick-log reduction to five events; every action verb in the `actions:` array |
| "**Reliability** pertains to the ability of the system to perform its task without failure over a certain period." | `planner.test.js`, `stats.test.js`, `time.test.js`, `mockNights.test.js` — you have a test suite; this names why it exists |
| "**Performance** refers to the quality of response of the system to the end-user. Also, **User Experience (UX) highly depends on system performance.**" | `generateTimeline()` is a pure function of `(profile, logs, now)` — recomputation is cheap by construction |
| "**Security** ensures that only authorized users can have access to the system and its data." | ⚠ **Gap.** Sleep, fatigue, and caffeine logs are health data. See §5. |
| "**Availability**… make sure that the end-users are well informed with the details and timelines." | A night-shift tool that is down at 03:00 is down when it is needed |

**Why it's relevant:** this single module converts your app from "a thing I made" into "a system with specified quality attributes." It is also the cheapest chapter section to write, because the requirements already exist implicitly in the code — you are documenting, not inventing.

**Quotable material — use cases capture both kinds of requirement:**

> "One common misconception about Use Case is that only functional requirements (FR) are considered and the non-functional (NFR) ones belong somewhere else. **Wherein fact, FR can be captured as use cases while NFR can be associated with the use cases.**"

**Concrete suggestion:** draw one use-case diagram with **Night-shift worker** as the primary actor and `Complete onboarding · Log a night event · View tonight's plan · Adjust a plan parameter · Review sleep history` as use cases. Your `ADJUSTABLE` map in `planner.js` is already a documented list of 17 tunable parameters — that is a requirements specification in disguise, and it belongs in an appendix.

---

### 2.3 MMS 149 Module 4 — Software Design & Implementation → *architecture and code standards*

**APA**
> *Module 4: Software design and implementation* [Course module]. (2023). MMS 149: Software Engineering in Multimedia Practice, University of the Philippines Open University.

**Quotable material — the framing sentence.** Quote this at the top of your Design chapter:

> "In software design, architecture is developed to link the requirement analysis phase to the actual system implementation. **If the previous phase answers the question 'what', software design answers 'how'.**"

**Quotable material — the four design aspects,** which give you four ready-made subsection headings:

> "1. **Data Design** — the complexity of the system can be determined by presenting the data structure…
> 2. **Architectural Design** — This shows the interactions and relationships between the major components of the system. Since this is highly associated with non-functional requirements (NFR), **the architectural style and design should be based on NFR**…
> 3. **Procedural Design** — Represents the algorithmic model of the system which can be directly translated into a source code… Can be in the form of pseudocodes, flowcharts or tabular
> 4. **Interface Design** — Shows the layout of the interface of the interactions of the user with the system… **A highly-efficient system might still not be accepted if the interface is rejected by the users**"

That last sentence is the hinge of your whole thesis — a scientifically correct planner that people abandon is worth nothing. It also connects Module 4 straight to MMS 150 and MMS 174, letting you argue the design and engineering halves are one argument, not two.

**Quotable material — modularity, and the cost of getting it wrong:**

> "**Overall Complexity is the sum of the complexity of each module plus the complexity of the actual integration.** If there are too many subdivided modules, each of these will be simple. However, the integration of these is complicated. If there are fewer subdivided modules, each of these will be complex. However, the integration of this is simple. **Note that complexity represents cost.**"

**Where it lands:** your module split is `time.js` (clock arithmetic) → `planner.js` (rules) → `stats.js` (aggregation) → `screens/` + `ui/` (presentation), with `tokens.js` as shared vocabulary. That is a defensible layering and you can now describe it in the module's own terms.

**Quotable material — data-flow design,** which describes `generateTimeline()` almost exactly:

> "**Transform-centered flow** — The input data is then transformed into an output data
> **Transaction-centered flow** — The input data is evaluated and alternative paths will be selected based on the result of the evaluation"

Your planner is both: `(profile, logs, now)` → timeline is transform-centered; the `changed:` branches ("Shortened because you skipped the last one") are transaction-centered. Say so.

**Quotable material — coding standards,** for your implementation section:

> "**Use meaningful variable names** to help you during debugging. Do not use 'var1', 'var2', etc. Instead, use 'lastname', 'firstname', 'address'…"
> "Coding Documentation… **This can serve as a guide to other developers who will then maintain the system in case the original programmers are no longer part of the maintenance team.**"

Your repo already honours this — the comment above `calculateShiftPhases()` explaining why the circadian low is an overlay rather than a phase is exactly the practice Module 4 describes. Quote the module, screenshot the comment, done.

**Quotable material — programming language selection,** which you must justify (React/Vite/Vitest):

> "Selecting which programming language to use greatly depends on the nature and scope of the system. However, other factors influence the selection procedure such as **the computational and algorithmic power of the language, its easiness to use, the convenience of testing and maintaining the system**, or even the preference of the client based on the skills of their in-house developers."
>
> "In some projects, the company chooses to have an **open-source** PL to cut the budget for licenses."

---

### 2.4 MMS 149 Module 5 — Testing & Maintenance → *how you know it works*

**APA**
> *Module 5: Software testing and maintenance* [Course module]. (2023). MMS 149: Software Engineering in Multimedia Practice, University of the Philippines Open University.

**Quotable material — Boehm's distinction.** This is the most useful sentence in the entire folder for your Validation section:

> "**Verification: 'Are we building the product right?'** — Does the software meet the functional and non-functional requirements? Does the software achieve its objective without any bugs?
> **Validation: 'Are we building the right product?'** — Does the software meet the expectations of the clients? … Validation is important because **there are times when the specification requirements do not represent the real needs of the customers.**"

**Why it's relevant — and this is the important one:** your Methodology uses "validation" for the expert review, but what the experts actually assess is closer to *both*. Splitting the two gives you a much cleaner Chapter 3:

- **Verification** = your Vitest suite + the traceability check (does each feature match its cited study?)
- **Validation** = expert review + scenario-based testing (is a circadian-aware planner the right answer to this problem at all?)

You already run verification; you just haven't called it that.

**Quotable material — the honest limit,** for your Limitations section:

> "**Software testing discloses the presence of bugs, but not their absence.** This means that we can only address the problems that we have encountered but we cannot do something about the ones we did not discover."

**Quotable material — confidence scales with stakes:**

> "The more critical the purpose of the system is, the more reliable it should be. For example, **systems concerning health should have a higher level of confidence** than that of supply inventory."

This is a direct argument for why your test suite exists at all, and a graceful way to acknowledge that a health-adjacent tool validated only by experts carries residual risk.

**Quotable material — testing strategies,** to name what you have and what you lack:

> "**Unit Testing** — Focuses on checking if the unit of code (smallest testable part) is fit to use… This is done by the developer itself." → *you have this*
> "**Acceptance Testing** — Use to check if the requirements of the clients are all satisfied. **Usually carried out by the end-users**… Alpha testing is done by the developers while Beta Testing is conducted by selected end-users." → *your scope explicitly excludes this; say so, citing this definition*

**Quotable material — the maintenance warning,** which justifies your documentation effort:

> "In some cases, **systems that are hard to maintain due to lack of documentation or poor coding are put to the trash.** It will be easier to develop and start a new one than to locate the errors and understand the work of the previous team."

---

### 2.5 MMS 171 — DeRose et al. → *the content architecture citation*

**APA**
> DeRose, S. J., Durand, D. G., Mylonas, E., & Renear, A. H. (1990). What is text, really? *Journal of Computing in Higher Education, 1*(2), 3–26.

⚠ The copy in your folder is a reprint with its own page numbering (1–24) rather than the journal's (3–26). Locators below are given by section heading, which is safe; add journal page numbers if you can access the original.

**Why this is the best backend reference in the whole folder:** it is a real, peer-reviewed, citable paper — not a course handout — and its thesis is precisely the architecture your app needs for multimodal micro-care content (text guidance, audio breathing, short movement videos, timelines).

**Quotable material — the core claim** (§ "OHCO: What Text Really Is"):

> "Combining these essential elements, we can describe a text as an **'ordered hierarchy of content objects,' or 'OHCO.'**"
>
> "Each type of content object usually has its own appearance when a document is printed or displayed, but **that appearance is superficial and transient rather than essential** — it is the content elements themselves, along with their content, which form the essence of a document."

**Quotable material — why format-as-storage fails** (§ "Text as Characters and Formatting Instructions"):

> "consider locating the next poetry quotation or the next equation. These are natural operations, on objects that are of interest to authors; yet **they are not possible, because there is no explicit indication of what part of the text is poetry**… The information which *is* present — formatting information — is inessential: it has only to do with a particular design style, a particular text processing program, and a particular output device."

**Quotable material — reuse and multimodality** (§ "Turning Text into a Database"):

> "Since the OHCO model provides a way of representing text that can be decomposed into smaller pieces, **it can also be used to integrate a wide variety of different types of data or media into a 'compound document.'** Many current attempts to handle multimedia or compound documents are based on some form of hierarchical content model."

**Quotable material — the closing line,** worth an epigraph:

> "**Let me write a nation's data structures, and I care not who writes its code**" — W. Richard Ristow, quoted in DeRose et al. (1990), § Summary
>
> "any software application, or any set of computing practices that is based on some other model of text is inadequate for our intellectual and scholarly purposes… **if those features are not indicated, then no software, however ingenious, can recover them.**"

**Where it lands in the repo — and this is a real design decision, not a retrofit.** Your timeline items are already content objects with semantic fields, not formatted strings:

```js
{ id, at, category, title, msg, why, changed, actions, priority, adjust }
```

`category` is the content type; `tokens.js` maps it to a hue and icon at *render* time. That is exactly DeRose's separation of content object from appearance — the same item can render as a card, a timeline row, a notification, or a printed plan without changing the data. Cite DeRose and this becomes a principled architecture rather than a coincidence.

**Drop-in paragraph for the Design chapter:**
> Plan items are stored as structured content objects carrying semantic type and rationale rather than presentational markup, following the ordered-hierarchy-of-content-objects model (DeRose et al., 1990). Because appearance is "superficial and transient rather than essential" (DeRose et al., 1990), a single item definition can be rendered as a timeline entry, a reminder notification, or a printed summary without duplication — a requirement that follows directly from the study's commitment to multimodal micro-care content.

---

### 2.6 MMS 174 Module 3 — Digital Concepts → *asset specification*

**APA**
> Goli-Cruz, M. J. (2023). *Module 3: Digital concepts and application* [Study guide]. MMS 174: Graphics in Multimedia, University of the Philippines Open University.

**Quotable material** — the compression trade-off, which you need in order to specify your video/audio micro-care assets responsibly:

> "**Lossless compression** — Algorithms reduce image file sizes without losing data… This compression is useful for text and graphics with distinct lines and forms.
> **Lossy Compression** — Algorithms that discard data decrease image files. This compression reduces file size more than lossless compression but degrades image quality."
>
> "**PNG:** A lossless format commonly used for images with defined shapes and precise lines, such as logos and icons. … **SVG** is a vector graphics format that can be scaled to any size without losing quality."

**Why it's relevant:** you use `@phosphor-icons/react` — vector icons. Module 3 gives you the citation for why vectors and not PNGs, and file-size discipline matters concretely for a user on mobile data at 3 AM.

**Useful external link from this module:**
> Cornell University Library Research Department. (2003). *Moving theory into practice: Digital imaging tutorial.* http://preservationtutorial.library.cornell.edu/contents.html

---

## 3. Accessibility — the argument that cuts across both halves

**APA**
> Esteves, K. (2025). *MMS 151: Introduction to web accessibility* [Course guide, 3rd Trimester A.Y. 2025–2026]. University of the Philippines Open University, Faculty of Information and Communication Studies.

**Quotable material — the responsibility framing.** This is quotable almost in full, and it is the most rhetorically forceful passage in the folder:

> "Introduction to Web Accessibility is a course designed to inform you about **responsible and inclusive digital design**. Every student, regardless of course or program should learn how to produce digital products with accessibility in mind. **It is your responsibility to ensure that the digital products you produce are accessible to people of all abilities.** Web accessibility is required by law in some countries. Companies, organizations, even universities are at risk of being sued if their websites and digital content are not accessible to all."

And from the objectives:

> "Critically evaluate arguments about **accessibility as a civil rights issue**"

**Why it's relevant — and this is not a box-ticking section.** Your users are, by definition, **fatigued, at 3 AM, on a screen, with degraded attention and working memory** — your own literature review says so, citing Vlasak et al. (2022) and Folkard & Tucker (2003). That is a *situational* impairment, and it is exactly what accessible design is engineered for. Accessibility is not an add-on to Graveyard; it is the same problem your thesis is already about, arriving from a different discipline.

⚠ *Correction, 20 Aug 2026.* This entry originally attributed the cognitive claim to "Wickwire et al. (2021)". No such publication exists — Wickwire's 2021 record is obstructive sleep apnoea and sleep-economics work, and the source is in neither the thesis reference list nor this ledger's §6. The claim's real sources, both already in the thesis, are Vlasak et al. (2022) for the cross-sectional deficits and Folkard & Tucker (2003) for the decline across successive shifts. Verified against Crossref author records on 20 August 2026.

**Drop-in paragraph — use this one, it is the strongest single argument available to you:**
> Accessible design is conventionally justified by permanent disability, but the same techniques address situational and temporary impairment. Night-shift workers show measurable declines in cognitive control, working memory, psychomotor vigilance, visual attention, and processing speed relative to non-shift workers (Vlasak et al., 2022), and safety declines further across successive night shifts (Folkard & Tucker, 2003); an interface used under those conditions faces constraints functionally similar to those accessibility standards are designed to accommodate. Designing to WCAG 2.2 (W3C, 2023) is therefore not an ancillary compliance activity in this study but a direct response to the cognitive profile of the target user, consistent with the principle that producing accessible digital products is a designer's responsibility rather than an optional enhancement (Esteves, 2025).

**The standards themselves** — cite these, not just the course guide:

> World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/
>
> World Wide Web Consortium. (2014). *Website accessibility conformance evaluation methodology (WCAG-EM) 1.0*. https://www.w3.org/TR/WCAG-EM/

The MMS 151 outline names both, plus "Understanding the 4 Principles of Accessibility" (Perceivable, Operable, Understandable, Robust) — four ready-made subsection headings for an accessibility appendix.

**Where it lands in the repo — with an honest finding.** `src/tokens.js` needs a contrast audit. Some pairs are likely fine; some are not obviously so:

```js
DARK.faint  = "#6E6B76"   // on DARK.card #1E1E26 — likely below 4.5:1
WARM.faint  = "#A9A398"   // on WARM.card #FFFFFF — likely below 4.5:1
```

Run every `ink`/`muted`/`faint` value against its background and every `DOMAIN.hue` against both themes. Report the results as a table — a genuine audit with two or three failures found and fixed is *far* more credible than a claim of conformance. Two tools, one already cited in your own MMS 174 module:

- Coolors contrast checker — https://coolors.co/contrast-checker (cited in MMS 174 Module 2)
- Venngage, *How to use color blind friendly palettes* — https://venngage.com/blog/color-blind-friendly-palette/ (also cited in MMS 174 Module 2)

That second one matters specifically for you: `DOMAIN` encodes eight categories **by hue alone**. Under deuteranopia, movement `#2FA96B` (green) and light `#DDA02B` (amber) converge. The icons already carry the meaning too, so this is defensible — but only if you *say* the icon is a redundant channel rather than decoration. That is a one-sentence fix in the thesis and a real accessibility argument.

---

## 4. Methodology reinforcement (MMS 149 Module 2)

**APA**
> *Module 2: Software project management* [Course module]. (2023). MMS 149: Software Engineering in Multimedia Practice, University of the Philippines Open University.

Lower priority than the rest, but two passages earn their place.

**Stakeholder identification,** which your thesis needs because it has an unusual respondent structure (experts, not end-users):

> "A **stakeholder** is anyone who has a valid interest in the activity or decision in a project or people who can be affected by the project. Specifically, this includes: **Project Team** … **Sponsors and end-users** … **External Group**"

Your Significance section already lists healthcare providers, employers/HR, authorities, designers/developers, and workers. Module 2 gives you the term for that list and a citation for why it belongs in Chapter 1.

**Change control,** if you keep a development log:

> "Once the proposed design has reached a satisfactory rate from the client, the design is now **baselined**. A baseline plan includes the project's scope, schedule, and costs…"
>
> "**Development changes**: These pertain to the routine of refining a product. An example is the screen layout adjustment since the baseline plan failed to anticipate the diversity of end-users' devices."

Your git history *is* a change log — `feat: timeline preview on starting plan, 7 explainers to 3, drop dead copy` is a development change in Module 2's exact sense. A short appendix table of major design revisions, framed in this vocabulary, turns commit noise into methodological evidence of the iteration you claim.

---

## 5. Gaps this exercise exposed

Worth naming in Limitations before a panelist names them for you.

1. **No security requirement is specified.** Module 3 lists Security as a core quality attribute; sleep, fatigue, and caffeine logs are health data about an identifiable person. Your Ethical Considerations section currently says "no personal, sensitive, or identifiable data will be collected" — true of the *research*, but the *app* collects exactly that from its user. State where data lives (local-only?), who can read it, and what happens on device loss.
2. **No named accessibility conformance target.** Pick one and commit: WCAG 2.2 Level AA is the defensible default.
3. **MMS 149 module authorship is unresolved.** Confirm with UPOU FICS before the reference list is final.
4. **The two MMS 150 audio lectures are unmined.** They are 9–10 minutes each and are the only UI/UX source you have with actual argument in it, as opposed to a syllabus. Listen and pull quotes.
5. **No creative brief exists.** MMS 174 Module 4 says one should precede production. Writing it now, retrospectively, is normal practice and closes the loop.
6. **This ledger only ever covered half the reference list, and the half it skipped is where the fabricated citation got in.** Its remit is the course materials — the *how it was built and how it looks* half named in §0 — so the circadian and methodology literature was never logged anywhere. Of the 45 entries in the thesis reference list, 14 have an entry here; the other 31 have none, and "Kervezee et al. (2022)" reached Chapter II twice without a single line recording what it was supposed to support. §8 below opens that half of the ledger with the one entry that had to be fixed rather than merely added. The remaining 30 still need logging before the traceability claim in §0 is true of the whole paper rather than of its design chapters.

---

## 6. Consolidated reference list (APA 7)

Copy into Chapter references; ⚠ marks entries needing confirmation before submission.

**Peer-reviewed / published**

> DeRose, S. J., Durand, D. G., Mylonas, E., & Renear, A. H. (1990). What is text, really? *Journal of Computing in Higher Education, 1*(2), 3–26.
>
> Dutton, D. (2005). Aesthetics and evolutionary psychology. In J. Levinson (Ed.), *The Oxford handbook of aesthetics* (pp. 693–705). Oxford University Press.
>
> Heinrich, B. (2013). The biological roots of aesthetics and art. *Evolutionary Psychology, 11*(3), 743–761.
>
> Santoro, S. W. (2014). *Guide to graphic design*. Pearson.

**Standards**

> World Wide Web Consortium. (2014). *Website accessibility conformance evaluation methodology (WCAG-EM) 1.0*. https://www.w3.org/TR/WCAG-EM/
>
> World Wide Web Consortium. (2023). *Web content accessibility guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/

**Course materials — University of the Philippines Open University**

> Clariño, M. K. (2024). *MMS 150: User interface and user experience design* [Course syllabus, A.Y. 2024–2025]. University of the Philippines Open University.
>
> Clariño, M. K. (2024). *Evaluating user interfaces and UX design benefits* [Audio lecture]. MMS 150, University of the Philippines Open University.
>
> Clariño, M. K. (2024). *High-fidelity prototyping with Figma* [Audio lecture]. MMS 150, University of the Philippines Open University.
>
> Esteves, K. (2025). *MMS 151: Introduction to web accessibility* [Course guide, 3rd Trimester A.Y. 2025–2026]. University of the Philippines Open University.
>
> Goli-Cruz, M. J. (2023). *Module 1: Graphic design — Definition, importance, and history* [Study guide]. MMS 174, University of the Philippines Open University.
>
> Goli-Cruz, M. J. (2023). *Module 2: Graphic design elements and principles* [Study guide]. MMS 174, University of the Philippines Open University.
>
> Goli-Cruz, M. J. (2023). *Module 3: Digital concepts and application* [Study guide]. MMS 174, University of the Philippines Open University.
>
> Goli-Cruz, M. J. (2023). *Module 4: The graphic design process* [Study guide]. MMS 174, University of the Philippines Open University.
>
> Goli-Cruz, M. J. (2023). *Rubrics for MMS 174 assessment tasks* [Assessment rubric]. MMS 174, University of the Philippines Open University.
>
> Vega, J. M. M. (2023). *MMS 170: Aesthetics in Multimedia* [Course guide, 3rd Trimester A.Y. 2022–2023]. University of the Philippines Open University.
>
> Vega, J. M. M. (2023). *MMS 171: Text in Multimedia* [Course guide, 1st Trimester A.Y. 2023–2024]. University of the Philippines Open University.
>
> ⚠ *Module 1: Software development basics* [Course module]. (2023). MMS 149, University of the Philippines Open University.
>
> ⚠ *Module 2: Software project management* [Course module]. (2023). MMS 149, University of the Philippines Open University.
>
> ⚠ *Module 3: Requirements engineering* [Course module]. (2023). MMS 149, University of the Philippines Open University.
>
> ⚠ *Module 4: Software design and implementation* [Course module]. (2023). MMS 149, University of the Philippines Open University.
>
> ⚠ *Module 5: Software testing and maintenance* [Course module]. (2023). MMS 149, University of the Philippines Open University.

**External resources cited within the course materials** (usable directly)

> Cornell University Library Research Department. (2003). *Moving theory into practice: Digital imaging tutorial.* http://preservationtutorial.library.cornell.edu/contents.html
>
> Hannah, J. (2022). *What is typography, and why is it important? A beginner's guide.* CareerFoundry. https://careerfoundry.com/en/blog/ui-design/beginners-guide-to-typography/
>
> Hayward-Cole. (2019). *7 basic principles of graphic design.* London College of Contemporary Arts. https://www.lcca.org.uk/blog/careers/7-basic-principles-of-graphic-design/
>
> Reid, M. (2018). *The 5 rules of design composition and layout.* 99designs. https://99designs.com/blog/tips/design-composition-and-layout/
>
> Venngage. (n.d.). *How to use color blind friendly palettes to make your charts accessible.* https://venngage.com/blog/color-blind-friendly-palette/

---

## 7. Suggested order of work

1. **Add `src:` / `designSrc:` fields to `planner.js` items** — makes the traceability check executable and is the highest-leverage change here.
2. **Run the contrast audit on `tokens.js`**, fix what fails, and write up the findings honestly (§3).
3. **Write the creative brief appendix** using Santoro's seven headings (§1.2) — two pages, closes the biggest process gap.
4. **Split Verification from Validation in Chapter 3** using Boehm's two questions (§2.4).
5. **Listen to the two MMS 150 lectures** and pull timestamped quotes (§1.1).
6. **Confirm MMS 149 module authorship** with UPOU FICS (§5.3).

---

## 8. Health literature logged after the fact

Added 20 August 2026. The circadian and occupational-health sources were outside this ledger's original remit (§0), and §5.6 records what that cost. This section opens that half. It currently holds one entry, the one the audit of 20 August 2026 found had reached Chapter II under an author who never wrote it.

### 8.1 Boini et al. (2022) — *the metabolic and cardiovascular risk figures in Chapter II*

**APA**
> Boini, S., Bourgkard, E., Ferrières, J., & Esquirol, Y. (2022). What do we know about the effect of night-shift work on cardiovascular risk factors? An umbrella review. *Frontiers in Public Health, 10*, Article 1034195. https://doi.org/10.3389/fpubh.2022.1034195

**Why this entry exists at all.** Chapter II cited these figures twice to `Kervezee, L., Shechter, A., & Boivin, D. B. (2022). Impact of shift work on the metabolic syndrome and diabetes`. No such publication exists — the DOI carried in the reference list resolves to the Boini umbrella review, a different paper by four different authors. Because this ledger stopped at the course materials, nothing here recorded the citation and nothing caught it. Re-attribute every instance to Boini et al.

**What it actually supports** (resolved through Crossref and the Frontiers full text, 20 August 2026)

| Chapter II claim | What Boini reports | Verdict |
|---|---|---|
| ~10% increase in diabetes risk | "An excess risk estimated at around 10% of developing diabetes among shift workers compared to day workers"; night shift OR = 1.09 (1.04–1.14) | Supported |
| ~30% higher hypertension risk | "An excess risk of hypertension… estimated at around 30% when considering the broad definition of shift work and when night periods were included in rotating shifts" | Supported |
| 25–38% greater likelihood of **obesity** | The 1.25–1.32 range and the 38% night-shift figure are for **overweight**. Obesity is a separate estimate: "5% for night-shift workers and… 18% for rotating shift workers" | **Wrong outcome variable.** Say overweight, or use 5% / 18% and say obesity |
| Higher cortisol and poorer immune function than day workers | The review presents no cortisol or immune-marker data. Immune dysregulation appears in the discussion as mechanism, not as a measured result | **Not in source.** Cut the sentence or find a source that measured it |

**Where it lands in the paper.** Chapter II, Health Risks (the four risk figures) and Comparison with Day Shift Office Workers (the cortisol/immune sentence, which this source cannot carry). Nowhere in the repo — these figures justify the problem, not a feature, so no `src:` key points at them.

**Note on scope.** Boini is a cardiovascular-risk-factor umbrella review. It is the right source for the metabolic and blood-pressure numbers and the wrong source for anything endocrine or immunological. The audit of 20 August 2026, §2.1 to §2.4, is the record of how far that mismatch had already travelled.
