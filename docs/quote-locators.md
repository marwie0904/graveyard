# Quote locators — closed 22 August 2026

Every direct quotation in `docs/sample-paper.html` now carries a locator, and every one was
checked verbatim against the source in `~/Downloads/Graveyard_References/`. 37 quotations
across 8 course documents, plus the four Dutton and Heinrich page numbers already in the text.

## Which locator, and why

The sources split cleanly, and APA 8.28 takes the split as it comes: a page number where the
document prints one, a section heading where it does not.

| Source | Printed page numbers | Locator used |
|---|---|---|
| MMS 149 Modules 1, 3, 4, 5 (UPOU 2023a–d) | **No** — checked every page of all four | Section heading |
| MMS 174 Study Guides 2 and 4 (Goli-Cruz 2023a, 2023b) | Yes, 1:1 with PDF pages | `p. N` |
| MMS 151 Course Guide (Esteves 2025) | Yes | `p. 1` |
| MMS 150 Syllabus (Clariño 2024) | Single-page image | Section heading |
| DeRose et al. (1990) | Reprint paginates 1–24 vs journal 3–26 | Section heading |

The MMS 149 modules were the reason this file existed as a to-do. They carry a header on
page 1 and nothing in the footer — 9, 9, 7 and 8 pages with no numbering anywhere — so a page
number taken off the PDF reader would be an artifact of the reader, not a locator a second
reader could confirm.

## Sections used

| Citation | Section |
|---|---|
| UPOU 2023a | Prototype Model · Waterfall Model · Which Model Is the Best to Use? |
| UPOU 2023b | Functional vs Non-functional Requirements |
| UPOU 2023c | Software Design and Implementation · Software Design Aspects · Design Concepts · Data Flow-Oriented Design |
| UPOU 2023d | Verification and Validation · Software Testing Strategies · Limitation of Software Testing |
| Clariño 2024 | Course Description and Topics |
| DeRose et al. 1990 | OHCO: What Text Really Is · Text as Characters and Formatting Instructions · Turning Text into a Database |

## What the verbatim check turned up

**One misquote, corrected.** Heinrich (2013, p. 752) reads "But **that** aesthetic environment
includes not only our visual cues but also an aural landscape." The paper had "**the** aesthetic
environment". This is the sentence the audio channel is argued from, so it is the one quote in
the paper where a single word mattered.

**Four page numbers confirmed rather than assumed.** `audit-2026-08-20.md` recorded Dutton and
Heinrich as "quotes verified, page assignments consistent with position but not confirmed
against paginated PDFs". They are now confirmed: Dutton p. 698 and p. 703 against the copy's
own `end p.NNN` markers, Heinrich p. 752 and p. 755 against the journal footer.

**Clariño's metadata confirmed.** The syllabus names Assist. Prof. Mary Kristene Clariño and
A.Y. 2024–2025, matching the reference entry's initials and year.

**Everything else matched.** All 37 quotations are verbatim, including the two bracketed
grammatical edits (`link[s]`, `[s]`), which are used correctly.

## Still open — not a locator question

The five MMS 149 module PDFs carry no author line (`reference-integration.md:227`). The paper
cites them corporately to UPOU. The 2T 2023–2024 course guide names Rosangela Anne Salaya as
faculty-in-charge while the modules are headed 2nd Trimester 2022–2023, a different term.
Confirming authorship with FICS would change four reference entries and every in-text citation
pointing at them.
