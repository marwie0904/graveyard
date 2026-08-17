# Accessibility status

Where the prototype stands as of 2026-08-18. Graveyard is a phone application,
so "screen reader" below means VoiceOver and TalkBack, and the relevant
settings are the ones a user has already turned on system-wide before they ever
open this app.

The target is WCAG 2.2 Level AA, scoped to the screens actually built. That
target is what makes the open list binding rather than aspirational — the paper
already claims it. Measured contrast figures and the paper-vs-build
discrepancies live in `docs/paper-vs-build.md` §2.

---

## Implemented

Each item below was checked in a browser on 2026-08-18, not only against the
source: focus order and ring by keyboard, the trap by tabbing past the last
control in both directions, the countdown by sampling the live region over
several seconds, the heading outlines through the rendered document, and
contrast by measuring every rendered text node against the surface behind it in
both themes. That last sweep is what caught the `#6C6BE8` badge below — a
hardcoded colour is invisible to a test that iterates the token table, so the
table-based guard and a rendered sweep catch different things.

- **Reduced motion is honored.** The operating system's reduce-motion setting
  switches off the ambient animations and collapses every transition, including
  the breathing circle on the care screen.
- **Contrast meets AA.** Every text token clears 4.5:1 against the surface it
  actually sits on — `muted` against `sunken` and `faint` against `bg`, the
  darkest ground each is used on, not merely against white. Domain colours now
  carry a separate `ink` value per theme for use as text; the original `hue`
  stays as the icon, meter, chip and wash fill, where the 3:1 non-text floor
  applies. `src/tokens.test.js` asserts the whole table in both themes, so the
  palette cannot drift back. The "Circadian low" badge was the one colour that
  escaped both the palette sweep and that guard, because it was a hex written
  straight into the component (`#6C6BE8`, 4.28:1 warm and 3.87:1 dark, and not
  theme-aware at all); it now reads from the sleep `ink`, and a second test bans
  non-white colour literals outside `tokens.js` so the next one cannot hide the
  same way.
- **Changing content is announced.** The status region is mounted for the life
  of the app and only its text changes — a region that appears together with
  its message is not reliably read out. Every confirmation already routed
  through `say()` (`src/App.jsx:2750`), so logs, undo, export, reflection saves,
  plan regeneration and the night rollover all speak. The care sequence
  announces step changes, each whole minute remaining, and completion; the
  per-second counter is deliberately outside the region, since a live region
  that fires every second cannot be listened to.
- **Headings describe the structure.** Each screen has one `h1` and a
  descending outline beneath it, so VoiceOver's rotor and TalkBack's reading
  controls can skim. `Display` and `Eyebrow` take an `as` prop; nothing about
  the visual design changed. Control labels, data keys and the kickers that sit
  above each title were deliberately left as plain text — over-tagging costs the
  rotor as much as under-tagging.
- **Icons are decorative unless they carry meaning.** The app-wide
  `IconContext` (`src/main.jsx`) hides every icon from assistive technology by
  default, which is correct for all but one of them: each sits beside text that
  already names it. A meaningful icon opts back in at its call site. Icon-only
  buttons carry the name on the button, not on the glyph.
- **Focus is visible.** A single `:focus-visible` rule in `index.html`, in two
  tones so it survives the warm page, the dark page, the hero band and the dusk
  gradient alike — no single colour clears 3:1 against all four. It references
  no theme token on purpose, so a future palette change cannot blind it. Touch
  users never see it.
- **Overlays manage focus.** All six overlays — the care player, the profile
  sheet, both quick-log branches, the adjust sheet and the time editor — share
  one `useOverlay` hook (`src/ui/index.jsx`). It moves focus in on open, traps
  Tab and Shift-Tab, closes on Escape and returns focus to whatever opened it.
  Each carries `role="dialog"` and `aria-modal`, which is the half that matters
  on a phone: it is what stops a screen reader swiping out into the covered
  screen, something no Tab trap can do. Overlays nest — the time editor opens
  from inside the profile sheet — so a stack keeps only the topmost listening.
- **Native form controls.** Reflection answers and every time picker use the
  platform's own select controls, so keyboard operation, focus order and
  screen-reader semantics come from the OS rather than from custom code. Six of
  them are still missing labels — see item 2 below.
- **Moving content can be paused.** The timed breathing and stretch sequences
  have a pause control, so nothing animates without a way to stop it.
- **Touch targets meet AA.** The smallest controls clear the 24×24 minimum
  comfortably.
- **Zoom is not blocked.** Pinch and system zoom work at any level.
- **Interface language is declared,** so screen readers use the right
  pronunciation rules.

---

## Not yet implemented

Five items, ordered by priority. Each maps to a WCAG 2.2 criterion at Level A or
AA, so none of them is optional under the conformance target the paper sets.
Ranking weighs how many users are affected against how much work the fix is.

All five surfaced while closing the previous six. Three of them are places where
this document previously claimed a thing was implemented and it was implemented
only in part — the general pattern was that the shared component did the right
thing and one or two hand-rolled call sites did not.

### 1. Click targets that are not buttons — 2.1.1, Level A

The care activity rows (`src/App.jsx:1932`) and the log rows on the reflection
screen (`src/App.jsx:1804`) are a `Card` and a `div` with an `onClick`. They are
not focusable, not operable from a keyboard, and not announced as controls.

Measured in the browser rather than inferred: **the whole Care screen exposes
six focusable elements — the profile button and the five tab-bar buttons.** All
five activity rows are non-focusable, and so are the five circular play controls
inside them, which look like buttons and are not. A keyboard or Switch Control
user who lands on that screen can do exactly one thing: leave it.

**Why:** first on the list because it is a Level A keyboard failure on the
app's two main interaction paths, and because of what it makes unreachable —
the care activity row is the only way into the care player, so a keyboard or
Switch Control user cannot start a session at all. The focus trap that screen
now has is behind a door they cannot open. The log row is the reflection
screen's only way to correct an entry. Both are the same fix: a real button,
which the rest of the app already uses everywhere.

**One knock-on, which closes with this item and not before:** because the
opener is not focusable, the care player's overlay has nothing to return focus
to, so closing it drops focus to `body`. The hook is behaving correctly — it
restores what it was given. Making the row a button gives it something to
restore.

### 2. Unlabelled time controls — 3.3.2 and 4.1.2, Level A

Six raw `<select>` elements have no label of any kind: the quick-log time
(`src/App.jsx:1764`, `:1769`, `:1775`) and the log-edit time (`:1829`, `:1836`,
`:1844`).

**Why:** a screen reader announces these as three unnamed pop-up buttons in a
row. Hour, minute and AM/PM are indistinguishable from each other by anything
except reading order, and getting them wrong writes a wrong timestamp into the
data the plan is generated from. The `Select` component in `src/ui/index.jsx`
already renders a visible label correctly — these six predate it and were never
moved over. Cheapest item on the list.

### 3. Toggle and disclosure state — 4.1.2, Level A

`Pill` (`src/ui/index.jsx:115`) does not report `aria-pressed`, though it is the
selected/unselected control for theme, reminder style, lead time and the review
answers. The disclosure button in `Section` (`src/App.jsx:1029`) does not report
`aria-expanded`.

**Why:** the sibling components already do this — `Choice` and `DayChip` both
set `aria-pressed`, and the two log disclosures both set `aria-expanded`. So the
gap is inconsistency rather than an unsolved problem, and a screen-reader user
hits it as a control that never says whether it is on. Two attributes.

### 4. Screen-change announcement — 4.1.3, Level AA

Nothing announces that the screen itself changed. Most visible on the plan
generation screen (`src/App.jsx:1201`), whose four steps flip every 520ms and
then hand off to a new screen in silence.

**Why:** the confirmations are now announced but the navigation is not, so a
screen-reader user knows an action succeeded without knowing where it landed
them. Ranked below the Level A items because it affects orientation rather than
operability, and above the last one because it is a real criterion. Larger than
it looks: doing it properly means one route-level announcement covering every
screen transition, not a patch on the generating screen. The generating screen
itself is un-announceable at 520ms per step — the meaningful event there is the
arrival of the plan, not the four steps.

### 5. Empty night labels in the strip — 1.4.3, Level AA

`DayChip` (`src/ui/index.jsx`) prints the label of a night with no data in
`T.hair`, roughly 1.08:1 against the page.

**Why:** last because it is one label on one control and because the honest fix
is a design decision, not a token change. The button stays clickable, so WCAG's
exception for inactive components does not cleanly cover it — but the whole
point of the dimming is to show which nights hold nothing, and any value that
clears 4.5:1 will read as available. Needs the strip's empty state redesigned,
or the criterion accepted as failed and declared.

---

## Known ceilings

Deliberate limits in what was built, recorded so they are not mistaken for
oversights. Both are marked in the source.

- **The focus trap follows Tab and Shift-Tab only.** Switch Control and the
  VoiceOver rotor walk the accessibility tree instead of the tab ring, which is
  what `aria-modal` covers here. The upgrade path is `inert` on everything the
  sheet covers, which needs one wrapper element around the app chrome that does
  not exist yet.
- **The quick-log sheet drops focus when its content swaps.** Going from the
  pick list to the result view removes the button that had focus, and it falls
  to `body`. The trap recovers on the next Tab and Escape still works, but the
  user loses their place.

---

## Declared, not built

Not gaps to close before the next milestone. Each needs one sentence in the
paper stating it as a direction rather than an implemented feature — the same
treatment the audio guidance already has.

- **Text scaling.** Every type size in the app is fixed, so Dynamic Type and
  Android display size have no effect. This is the most widely used
  accessibility setting on mobile and most people using it do not consider
  themselves disabled — but pinch zoom is available and does magnify, so the AA
  obligation is arguable, and unfixed sizes mean a reflow pass over every screen
  to survive larger type without clipping. An order of magnitude more work than
  anything above it. Declare it rather than half-build it.
- **WCAG-EM audit artifact.** The evaluation described in the paper has not
  been run and no report is stored in the repo. No user ever experiences this;
  it matters only because the paper asserts the procedure was followed. The
  reason to defer it was that running it against a long list would only document
  that list a second time — that reason has now expired. Five items remain, three
  of them two-line fixes. Close items 1 to 3, then run it.

---

## Considered and dropped

- **44pt / 48dp touch targets.** iOS and Android platform guidance, and WCAG's
  Level AAA criterion. The AA minimum is 24×24 and the app already passes it.
  Out of scope for the stated conformance target.
- **Following the OS dark-mode setting.** The theme tracks shift phase instead,
  with a manual override. Deliberate, and the better behaviour for this app.
- **Native `<dialog>` for the overlay sheets.** It would have given focus
  trapping, Escape and the top layer for free. Rejected on layout: the sheets
  are positioned inside a 430px phone frame, and `showModal()` promotes to the
  browser's top layer, which is viewport-relative — the panel would escape the
  frame and `::backdrop` would dim the whole window rather than the phone. A
  `position: fixed` dialog pins the panel back but `::backdrop` cannot be
  constrained to an ancestor, so the hand-rolled dim layer stays either way.
  The phone frame is the prototype's whole conceit.
