# Open items — 20 August 2026

What is left after the day's repair. Nothing here is a build defect: the audit's
findings are closed, the suite passes, the `.docx` rebuilds clean, and every number
the paper states as a measurement reproduces. See
[`verification-2026-08-20.md`](verification-2026-08-20.md) for the evidence.

**Updated 21 August 2026. All three blocking items are closed, and two of the three
limitations with them.** The Acknowledgement is written, the acceptance page carries all
three signatories, the contents lists carry page numbers Word computes for itself, and the
manual keyboard and screen-reader sessions have been conducted and stored. **The score is
now 53 / 60**, with accessibility at its maximum of 12.

One limitation remains. It can be defended as written or closed for a better score, and it
does not block submission.

| # | Item | Blocks submission | Cost to close |
|---|---|---|---|
| ~~1~~ | ~~Acknowledgement~~ | **Done** | Written 21 Aug — one detail would improve it |
| ~~2~~ | ~~Program Chair and Dean~~ | **Done** | Applied 21 Aug — **confirm before submitting** |
| ~~3~~ | ~~Contents page numbers~~ | **Done** | Automated 21 Aug — no longer a manual step |
| ~~4~~ | ~~Screen-reader pass~~ | **Done** | Run 21 Aug — E4 to band 3, C2 with it |
| ~~5~~ | ~~Human keyboard pass~~ | **Done** | Run 21 Aug — E2 to band 3 |
| 6 | Mutation tooling | No | Half a day. Moves A3 to a measured band 3 |

---

## Blocking

### 1. The Acknowledgement — written 21 August 2026

`docs/sample-paper.html:172-177` now carries three paragraphs, and the `.docx` renders
them. Adviser, coworkers, and a closing line. The `class="note"` that styled the old
placeholder is gone, so these are ordinary body paragraphs.

> I thank my adviser, Benigno Jr. Agapito, who advised this special project from
> proposal to submission.
>
> I thank the teams I have worked nights with across eight years in the industry, and
> the fifteen people on my current night shift whose schedules I am answerable for.
> Their nights, and their complaints about them, are the reason this study exists at
> all: the questions this planner tries to answer are the ones they asked first.
>
> Any error that remains is mine.

Coworkers are unnamed on purpose, which keeps this consistent with the Biographical
Sketch, where employers are unnamed by request. The second paragraph is still specific
without names, which is what the convention actually asks for.

**One thing would improve it, and only you can supply it.** The adviser line is honest
but general, because inventing a particular act for a real person on a signed document
is not something to guess at. If Agapito did something specific — a question that
redirected the study, a draft he read closely, a deadline he held — that sentence
should say so, and it would be the strongest line on the page.

**Optional, and worth considering.** If a nurse, physician, or occupational-health
officer gave input on the sleep science, name them here. The paper states that no
expert panel has been convened and Chapter V lists expert review as its first
recommendation, so an acknowledged informant answers a question a panelist may ask. If
nobody did, leave it out.

### 2. Program Chair and Dean — applied 21 August 2026

All three signature blocks on the acceptance page are filled; zero `NAME` placeholders
remain in the built `.docx`.

| Block | Prints as | Source |
|---|---|---|
| Adviser | `BENIGNO JR. AGAPITO` | Title page. Suffix in the given-name half, matching `benignojr.agapito@upou.edu.ph` |
| Program Chair | `DIEGO S. MARANAN` | "Prof. Diego S. Maranan" against the BAMS entry, [FICS faculty page](https://fics.upou.edu.ph/faculty/) |
| Dean | `ROBERTO B. FIGUEROA JR.` | "Assoc. Prof. Roberto B. Figueroa Jr."; appointed by the UP Board of Regents 27 February 2025, [term began 1 April 2025](https://www.upou.edu.ph/news/dr-roberto-b-figueroa-jr-appointed-as-new-dean-of-fics/) |

The two suffixes differ in form — Agapito's `Jr.` sits in the given-name half,
Figueroa's after the surname. Both are as their own institution prints them, so this is
correct rather than an inconsistency to normalise.

Maranan corroborates well rather than being a stale listing: he is a former FICS Dean,
which is why a search surfaces him under that title, and he facilitates **MMS 200
(Special Projects)** — this paper's own course.

> **Still confirm before submitting.** The FICS faculty page was last updated 19 May
> 2026, so a change since then would not show. And these are the *current*
> officeholders; if the paper is accepted under a later term, the names must match
> whoever actually signs.

They live in the `SIGNATORIES` array in `build-docx.mjs`, filled by position in the
order the acceptance page prints them. The build **throws** if it does not fill all
three, so a renumbered template cannot silently ship a blank signature page. Change
them there, not in the generated file, or the next build overwrites the edit.

### 3. Contents page numbers — automated 21 August 2026

Previously this said the numbers had to be typed in Word by hand, last, because Word
paginates differently from the PDF build and a number computed at build time would
contradict the document it sits in.

That reasoning was right about the numbers and wrong about the remedy. The build now
emits **`PAGEREF` fields** instead of text, so Word computes each number itself from
the page the heading actually landed on. A field cannot go stale against its own
document the way typed text can.

How it works, in `build-docx.mjs`:

- Each of the **69 contents rows** carries a right-aligned tab stop with a dot leader
  and a `PAGEREF` field pointing at a bookmark.
- Each row's `data-toc` target is matched to the block that holds it and given a
  bookmark. Matching runs strictest-first — whole-text, then contains, then a bare form
  that strips a chapter's roman numeral (Word supplies it from `numId 2`, so it is in
  the contents row but never in the heading's own text) and a figure row's trailing
  full stop.
- Front matter is searched before the body, so a name that is both a heading and a
  contents row — "List of Tables" — resolves to the heading.
- **The build throws if any target is unresolved.** An unplaced bookmark would print
  `Error! Bookmark not defined.` on the page, so it fails the build instead. It caught
  seven real mismatches when first run.
- `word/settings.xml` gains `<w:updateFields w:val="true"/>` so Word refreshes the
  fields on open rather than waiting for a manual F9.

**What you will see.** Word asks once, when the file opens, whether to update fields.
Say yes and the numbers appear. Until then the fields show a placeholder — that is the
field's stored value, not an error.

This is the only part of `settings.xml` that is no longer byte-identical to the
template: a single 30-byte insertion, verified as the only difference.

Verified in the built `.docx`: 69 `PAGEREF` fields, 69 bookmarks, every reference
resolves, no duplicate bookmark ids, 69 dot-leader tab stops, XML well-formed.

---

## Declared limitations — none of these blocks submission

Two of the three were closed on 21 August 2026 and are kept here with their results rather
than deleted, since the paper cites both reports. The third stands, and the paper states it
honestly and scores accordingly.

### 4. Screen-reader run — conducted 21 August 2026

[`wcag-em-screenreader-2026-08-21.md`](wcag-em-screenreader-2026-08-21.md). VoiceOver in
Chrome on macOS Tahoe 26.5.1, caption panel on. Across the four assessed screens, the six
overlays and the activity player, no control failed to announce its name and role, and all
three live regions announced without taking focus. **E4 Robust to band 3**, and **C2
Signaling with it**, since the activity-step region was exercised with spoken guidance off,
which is the configuration in which it is the announcement channel.

One thing did not get captured and is recorded as a limit rather than passed over:
`aria-current="page"` on the eleven navigation controls. CDP has no entry for it, so a
screen reader is the only instrument that reaches it, and this pass did not transcribe its
spoken wording. Nothing depends on it — E4 is at band 3 on no-failures — but it is the one
property in the build that no instrument has yet quoted. One `VO+Right` onto an active tab
with the caption panel open closes it.

### 5. Human keyboard pass — conducted 21 August 2026

[`wcag-em-keyboard-2026-08-21.md`](wcag-em-keyboard-2026-08-21.md). All four screens
reachable by Tab and reversible by Shift+Tab, Enter and Space both activate, traversal in
visual order, focus ring visible at every stop, no trap, and all six overlays hold focus,
close on Escape and return it to the opener. **E2 Operable to band 3.**

The care screen returns five stops rather than ten, which is correct: the five play
controls are `aria-hidden` divs because the row itself is the button and a button inside a
button is invalid.

2.2.2 is recorded as **not applicable** to the assessed screens rather than as a pass. All
three continuous animations belong to the onboarding path, so the criterion never engages
where the rubric looks. The reduced-motion block at `index.html:167` was verified on the
path where it does.

### 6. No mutation tooling

Table 6 A3 previously claimed its 61 tests were "each confirmed to fail when the
property it names is mutated." No mutation dependency or script exists in
`package.json`, so that claim is now **withdrawn** rather than substantiated.

The 61 tests are real and pass. A3 keeps band 3 on the strength of what the tests
assert, but the band rests on an argument rather than a measurement. Adding mutation
tooling would make it measured.

---

## After any edit

```
node build-docx.mjs      # close the .docx in Word first — a stale window will
                         # write the old content back over the rebuild
npx vitest run           # expect 22 files, 285 passed | 1 skipped (286)
```

The test count is load-bearing: Table 8 lists per-module counts summing to 286 and the
paper presents it as its strongest evidence. If the count moves, the table is wrong.

To re-run the accessibility measurements:

```
npm run dev
node drive-contrast.mjs http://127.0.0.1:5174/
node drive-names.mjs    http://127.0.0.1:5174/
```

Expect a text-contrast floor of 4.65:1 warm and 4.69:1 dark with zero runs below
threshold on every screen, and 402 controls with zero unnamed.
