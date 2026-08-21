# Screen-reader conformance evaluation — 21 August 2026

A manual assistive-technology pass over the four assessed screens of the
Interactive Planner prototype, recorded in the WCAG-EM report format Chapter III
adopts. It is the companion to
[`wcag-em-keyboard-2026-08-21.md`](wcag-em-keyboard-2026-08-21.md) and exists to
supply what the accessibility tree could not: `drive-names.mjs` confirms that
name, role, and state are *computed*, which is the same computation assistive
technology consumes, but no instrument in the repository can establish that any
of it is *spoken*.

## 1. Scope

**Target.** WCAG 2.2 Level AA, success criteria 4.1.2 Name, Role, Value and
4.1.3 Status Messages.

**Pages evaluated.** The four recurring nightly-use screens the rubric assesses:
dashboard, plan, reflection, care. The once-on-first-run screens are outside the
rubric's assessed scope and were not sampled.

**Also evaluated.** The six modal dialogs and the micro-care activity player.

## 2. Baseline

| | |
|---|---|
| Browser | Google Chrome, current stable release |
| Operating system | macOS Tahoe 26.5.1 |
| Assistive technology | VoiceOver, macOS built-in, default voice and verbosity |
| Caption panel | Enabled, so spoken output could be read as text rather than heard only |
| Evaluator | The researcher |
| Date | 21 August 2026 |

## 3. Method

VoiceOver was started before the application was loaded. Each screen was
traversed with `VO+Right` from the first item to the last. At each stop the
evaluator observed whether the spoken output carried the control's name, its
role, and its state where one is declared. Dialogs were entered with
`VO+Shift+Down` and their announcement on opening observed. The three live
regions were exercised by triggering each one and observing whether the output
arrived without focus moving to it.

## 4. Results

### 4.1.2 Name, Role, Value — **Pass**

No control on the four assessed screens, in the six dialogs, or in the activity
player failed to announce its name and role. The evaluator found no stop that
spoke a bare role with no name, and no stop whose spoken name disagreed with its
visible label.

One announcement was transcribed from the caption panel as a worked example. The
micro-care player's spoken-guidance toggle (`src/App.jsx:168`), after being
switched off, announced:

> Spoken guidance off, toggle button

This is the expected output for that control: the name is the `aria-label`, which
the source swaps with the state rather than holding constant, and the role is
resolved from `aria-pressed` being present. `aria-pressed="false"` contributes no
additional spoken word, which is correct behaviour rather than a missing state.

This result confirms in speech what `drive-names.mjs` established in the tree:
402 controls resolved across twenty-five screen and theme states with no
unnamed control, the pressed state carried on 123 of 123, and the expanded state
on 78 of 78.

### 4.1.3 Status Messages — **Pass**

All three live regions were observed to announce without focus moving to them.

| Region | Source | Trigger exercised |
|---|---|---|
| Route announcer | `index.html:186`, written at `src/App.jsx:2849` | Screen and tab changes |
| Toast | `src/App.jsx:3213` | Quick-log actions, which call `say()` |
| Activity step | `src/App.jsx:206` | Step change inside a guided activity |

The activity-step region required a configuration step worth recording. It is
authored as `aria-live={sound ? "off" : "polite"}`, so it is silent while spoken
guidance is on, which is its default state on every player open. This is a
deliberate anti-doubling measure, not a defect: with guidance on, the
application speaks the step itself, and a live region carrying the same text
would have VoiceOver read it twice. The region was exercised with guidance
switched off, which is the configuration in which it is the announcement
channel.

The two independently-mounted regions are separate by design. Both the route
announcer and the toast are mounted before the text they will carry, because a
live region that arrives together with its content is not reliably announced,
and they are held apart from each other so that a destination and a confirmation
cannot overwrite one another mid-sentence.

## 5. Limits of this evaluation

Three items are recorded as unmeasured rather than passed.

1. **`aria-current="page"` on the eleven navigation controls was not
   transcribed.** This is the one property CDP has no entry for, so a screen
   reader is the only instrument that can reach it, and this pass did not capture
   its spoken wording. The evaluator reported no failure on the navigation
   controls, and their name and role are covered by the 4.1.2 result above, but
   the specific question of whether the active tab announces as the current page
   remains open. One `VO+Right` onto an active tab with the caption panel
   visible would close it.

2. **Announcements were observed rather than transcribed.** One caption-panel
   line is quoted above; the remainder of the pass rests on the evaluator's
   observation that no control failed. A transcript of every stop would make the
   result reproducible by a reader rather than only re-runnable by an evaluator.

3. **One screen reader, one browser.** VoiceOver in Chrome. NVDA and JAWS in
   Windows browsers compute some names differently, and nothing here speaks to
   them.

None of the three is a failure against the criteria. Each is a bound on how far
the pass generalises.

## 6. Result

The four assessed screens present no failures against 4.1.2 or 4.1.3. Every
control announces a name and a role, and all three status regions announce
without taking focus.

This is the audit report the E4 Robust band 3 descriptor asks for — "No failures,
and confirmed against the success criteria by test or audit report" — and the
assistive-technology verification the C2 Signaling band 3 descriptor asks for:
"the cueing is confirmed by test or by assistive-technology verification recorded
in a report." With the keyboard report of the same date, the accessibility domain
holds no criterion whose evidence is an inspection.
