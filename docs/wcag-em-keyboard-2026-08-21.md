# Keyboard conformance evaluation — 21 August 2026

A manual keyboard pass over the four assessed screens of the Interactive Planner
prototype, recorded in the WCAG-EM report format Chapter III adopts. It exists to
supply what browser automation could not: the earlier CDP run delivered no key
events to the page, so activation and traversal order were inferred from the
elements being focusable buttons rather than observed. This pass observes them.

## 1. Scope

**Target.** WCAG 2.2 Level AA, keyboard-related success criteria only.

**Pages evaluated.** The four recurring nightly-use screens the rubric assesses:
dashboard, plan, reflection, care. The ten once-on-first-run screens are outside
the rubric's assessed scope and were not sampled here, except where noted under
2.2.2.

**Also evaluated.** All six modal dialogs, which share one focus-management
routine (`src/App.jsx`):

| # | Dialog | Source |
|---|---|---|
| 1 | Micro-care activity player | `src/App.jsx:155` |
| 2 | Your profile | `src/App.jsx:2173` |
| 3 | How did the rest go? | `src/App.jsx:2497` |
| 4 | Quick log | `src/App.jsx:2523` |
| 5 | Adjust *[plan item]* | `src/App.jsx:2622` |
| 6 | Time edit (shift / log) | `src/App.jsx:3283` |

## 2. Baseline

| | |
|---|---|
| Browser | Google Chrome, current stable release |
| Operating system | macOS Tahoe 26.5.1 |
| Assistive technology | None. This is a keyboard pass, not a screen-reader pass |
| Platform setting | macOS Keyboard navigation enabled, so Tab reaches buttons and links |
| Evaluator | The researcher |
| Date | 21 August 2026 |

## 3. Method

Focus was placed in the browser address bar and moved into the page with a single
Tab, so that no click set an initial focus position that could mask an ordering
defect. Each screen was then traversed forward with Tab to the end of the document
and backward with Shift+Tab. At each stop the evaluator recorded whether a focus
indicator was visible and whether Enter and Space activated the control. Each
dialog was opened from the keyboard, traversed, dismissed with Escape, and the
resulting focus position observed.

## 4. Results

### 2.1.1 Keyboard — **Pass**

Every interactive element on the four screens is reachable with Tab and reversible
with Shift+Tab, and every one activates with both Enter and Space. The care
player's pause and resume operate from the keyboard, confirmed across all five
guided activities.

### 2.1.2 No Keyboard Trap — **Pass**

Each screen traverses to the end and out to the browser chrome. No stop retains
focus. Within each of the six dialogs, focus is held while the dialog is open and
released on Escape, which is the intended behaviour rather than a trap: the exit
mechanism is a standard key documented by the pattern.

### 2.4.3 Focus Order — **Pass**

On all four screens the traversal order followed top-to-bottom visual order, with
no stop out of sequence.

Observed stop counts:

| Screen | Stops | Note |
|---|---|---|
| Dashboard | 8 | Excludes the navigation controls and the profile button; see §5 |
| Plan | 23 | Data-dependent — varies with the generated plan and how much of it is complete |
| Reflection | 15 | |
| Care | 5 | One per activity row |
| Care activity (in player) | 5 | |

The care screen returning five stops rather than ten is correct, not a shortfall.
The five play controls are `aria-hidden` presentational elements because the row
itself is the button, and a button nested inside a button is invalid; Appendix B
records this.

All six dialogs move focus into the panel on opening, hold it while open, close on
Escape, and return focus to the control that opened them.

### 2.4.7 Focus Visible — **Pass**

A focus indicator is visible at every stop on all four screens. The indicator is
authored outside the palette on purpose, at `index.html:161`: a 2px outline plus a
2px white box-shadow, both following `border-radius`, so it survives a palette
rework and reads on any surface.

### 2.2.2 Pause, Stop, Hide — **Not applicable to the assessed screens**

The criterion governs animation that starts automatically and runs longer than
five seconds. No such animation occurs on the four assessed screens. The three
continuous animations in the prototype — the gradient drift on `.gy-sky` and its
pseudo-elements, the float on `.gy-badge`, and the 900 ms rotation on `.gy-spin` —
all belong to the `Arch` component and the `StepMark` indicator, which render only
on the once-on-first-run path. `src/App.jsx:3162` documents this. Motion on the
assessed screens is limited to one-shot entry and exit transitions of 190–780 ms.

The reduced-motion implementation was nevertheless verified rather than assumed.
With macOS Reduce Motion enabled, the animations on the onboarding path stop, as
the `prefers-reduced-motion: reduce` block at `index.html:167` specifies. This is
recorded as a verified implementation detail, not as a conformance result on the
assessed screens.

`drive-coherence.mjs` supplies the corroborating automated measurement: 165 frames
sampled across every step of every guided activity, with no keyframe animation
running anywhere in the document.

## 5. Limits of this evaluation

Two items are recorded as unmeasured rather than passed.

1. **The navigation controls and the profile button are outside the recorded stop
   counts.** The counts in §4 are of screen-body controls. The eleven navigation
   controls and the profile button were traversed and behaved correctly, but their
   position in each screen's sequence and their contribution to each count were not
   written down. This matters more than the arithmetic: the eleven navigation
   controls carry `aria-current="page"`, the one property the CDP instrument has no
   entry for and therefore could not confirm. A screen-reader pass remains the only
   way to verify that property, and it is outside this evaluation.

2. **The plan screen's profile and progress state were not recorded.** Its 23 stops
   are a function of the generated plan and how much of it is complete, so the
   figure is a single observation rather than a fixed property of the screen.

Neither limit affects the pass results above, both of which rest on observed
behaviour rather than on the counts.

## 6. Result

The four assessed screens present no keyboard failures against 2.1.1, 2.1.2,
2.4.3, or 2.4.7. 2.2.2 does not engage on them, and the reduced-motion
implementation it would govern is verified on the path where it does.

This is the audit report the E2 Operable band 3 descriptor asks for: "No failures,
and confirmed against the success criteria by test or audit report."

E4 Robust and C2 Signaling turn on what assistive technology announces, which is
outside this pass. Both were evaluated separately on the same day and are recorded
in [`wcag-em-screenreader-2026-08-21.md`](wcag-em-screenreader-2026-08-21.md).
