# Missing items — `sample-paper-draft.docx`

What the BAMS template asks for that the build cannot supply. Everything else in
`docs/report-template.docx` is filled, either from the template itself or from
`docs/sample-paper.html`.

**Correction, 20 August 2026.** That second sentence was not true when it was
written, and this ledger had no entry for either thing it missed.
`word/footer3.xml` still held the template's literal placeholder `Title… `,
printing on every page of the body. And the template's page separation — the
runs of blank paragraphs that push each chapter and each front-matter section
onto a fresh page — was being consumed by the converter and never replaced, so
no chapter started on a new page and the front matter ran together. Both are
fixed and both are entries below. The miss came from reading the template as
content and not as formatting: this file recorded every field the template asks
to be filled and nothing about the shape the filled document has to take.

Rebuild after any change here: `node build-docx.mjs`. **Close the file in Word
first.** Word holds an open document in memory and does not reload it when the
file changes underneath; saving from a stale window writes the old content back
over the rebuild.

---

## Closed

| Item | What it holds now |
|---|---|
| Author, title page | GABRELLA C. ANG |
| Submission date, title page and acceptance page | August 20, 2026. `docs/sample-paper.html` read 29 December 2025 until 20 August 2026, which put the title page earlier than the assessment it reports and disagreed with the .docx; the HTML now reads 20 August 2026 and the two agree |
| Title, permission page | INTERACTIVE PLANNER: CIRCADIAN-AWARE PLANNER FOR NIGHT-SHIFT WORKERS: TIMING CAFFEINE, NAPS, AND MICRO-CARE |
| Author and title, acceptance sentence | Gabrella C. Ang / the title above |
| Degree, acceptance sentence | Bachelor of Arts in Multimedia Studies — the template read "the degree Course" |
| Adviser, signature block | BENIGNO JR. AGAPITO, copied from the title page |
| **Figure 1** | Drawn and embedded: an input–process–output diagram with the six shift phases as the process ring. Source `docs/figure1-conceptual-framework.html`, rendered by `node render-figure.mjs`. |
| **Figure 2** | Was missing entirely from the .docx, not only unfinished: the bar chart is drawn in CSS, so it arrived as nothing and only the caption survived. Now rendered from the paper's own chart and embedded. |
| **Basis for the conceptual framework** | The section had no citation at all. It now grounds the input–process–output structure in design science research, citing Hevner et al. (2004), Hevner (2007), and Peffers et al. (2007), all three added to the reference list. |
| **Biographical sketch** | Written from the researcher's own answers and CV: eight years of night shift from 2018, four of them at a contact centre in Rizal, the named progression through it, the current Operations Manager role and its team of thirty-five, and the hair loss and insomnia the study came out of. Third person, per the template convention. Employers are unnamed by request. |
| **Research Design** | Chapter III now names the paradigm Chapter II cites. Two additions: a paragraph calling the study a design science study (Hevner et al., 2004), drawing the consequence the panel asks about — no independent and dependent variables, because evaluation is artifact-based — and placing the report on the Peffers et al. (2007) process model chapter by chapter; and a replacement for the sentence that offered future expert validation as the only evaluation, which now names the rubric and the verification suite as what actually evaluated the build, keeping expert validation as the future step it is in Chapter V. Domínguez (2017) stays. |
| **Permission page classifications** | Ticked: Invention **No**, Publication **Yes**, Confidential **No**, Free **Yes**. The four pairs are floating rectangles with no text frame, so the tick is a filled box, applied to both the DrawingML and the VML fallback. Applied in `build-docx.mjs` by shape name, and the build throws if it does not find all four, so a renumbered template cannot silently ship an unticked form. |
| **List of Appendices** | Written, on its own page. The template names the section in its contents list but never defines it, so unlike the other two lists there was no heading to replace after; the build now emits a page break, the heading, and the two rows at the end of the List of Figures. |
| **Numbered lists and fourth-level headings** | Neither had a case in the converter's regex, so both were dropped without a warning: the four objectives under "Specifically, it aims to:" arrived as nothing, and thirteen `<h4>` subheadings across Chapters II, III, and IV went with them, which is why those chapters ran together as unbroken text. Lists are now written with their markers and a hanging indent, and fourth-level headings as bold italic, one step below the bold subheadings above them. |
| **Unknown HTML entities printed raw** | `decode()` carried a hand-written table of thirteen entities and passed anything else through untouched, so `esc()` wrote the ampersand and the paper printed `Clari&ntilde;o`, `Dom&iacute;nguez`, and `&alpha;&nbsp;=&nbsp;.84` in six places, two of them in the reference list. The four entities the paper uses are in the table, and an entity the table does not know now stops the build rather than reaching the page. |
| **Figure 2 printed at half size** | The figure was shot at the browser's own window width, 1045 px, and placed in a 6.27 in column, so the build scaled it to 0.58 and its 10pt labels printed at under 6pt. `render-figure.mjs` now takes the width of the element rather than of the window and corrects the viewport to hit it, which puts the labels at 9.3pt, the same scale as Figure 1. |
| **Running head on every body page** — *20 August 2026* | The template leaves `word/footer3.xml` as the literal `Title… `, and `settings.xml` sets no `evenAndOddHeaders`, so the even-page footer is never used and that placeholder printed on every page of the body. It now reads `Interactive Planner`, and the build throws if the string it replaces has moved, so a re-saved template cannot silently ship the placeholder again. Neither this nor the entry below was in this ledger before today. |
| **Page separation, front matter and chapters** — *20 August 2026* | The regex that tiles the template body put the paired `<w:p …>…</w:p>` branch before the self-closing one, so `[^>]*` ate the attributes on `<w:p w14:paraId="…"/>` and ran on to the next `</w:p>`, merging whole runs of blank paragraphs into single blocks. The replacement then stopped *at* a merged block and the blanks inside it survived: no chapter began on a new page, the Biographical Sketch, Acknowledgement and contents ran together, and roughly 124 stray blank paragraphs — about two and a half blank pages — sat after the contents and the two lists. Measured on the template, the corrected ordering tiles the body into 879 blocks where the old one produced 747. The self-closing branch is now first and accepts attributes, which also closes a dangling `bookmarkStart` on the permission page that Word auto-repaired and stricter readers did not. Breaks are emitted where the paper marks them: eleven in the document, seven of them chapters and appendices carrying `class="pb"`. |
| **Reference list indentation** — *20 August 2026* | All 45 entries carried `w:firstLine="720"`, the inverse of the hanging indent APA requires and of what `docs/sample-paper.html` specifies for itself. The converter's "read off the template" note had been misled by a single-line specimen, where the two forms are indistinguishable. All 45 now carry `w:left="720" w:hanging="720"`. |
| **Table columns, header weight and page spans** — *20 August 2026* | Column widths were computed only when every header cell declared one, and the HTML deliberately leaves the last cell unsized to take the remainder, so all 14 tables fell back to uniform columns — Table 6's `23/7/remainder` shipped as three equal columns, the rubric tables as five. Widths now follow the HTML. Header rows carried their bold on the paragraph mark rather than on the runs, so all 14 printed in regular weight; they are bold now, and each table carries `<w:tblHeader/>` on row 0, so the long tables repeat their headers across a page break instead of stranding rows. |
| **Continuation paragraphs indented** — *20 August 2026* | The converter read a paragraph's inner HTML and discarded its class, so every body paragraph went through the first-line-tab path, including the fifty-seven the paper marks `class="flush"` — the ones that follow a heading or a figure and take no indent. The class is now read. |
| **Figure captions, appendix headings, `Keywords:`, `Appendices` divider** — *20 August 2026* | Four finishing details the template asks for and the converter dropped. Figure captions sat below the image as one italic line, contradicting the document's own table captions; they are now in APA form above the picture, bold `Figure N` with the title italic beneath. Appendix headings printed as a single title-case line; they now head `APPENDIX A` and `APPENDIX B` in all-caps bold with the title on the line below. `Keywords:` printed italic where the template sets it bold. And the standalone `Appendices` divider page, template para 771, is emitted again. |

The first six live in the `FIELDS` map in `build-docx.mjs`. Change them there,
not in the generated file, or the next build overwrites the edit.

---

## Still open

### 1. Two signatory names

The acceptance page carries three signature blocks. The adviser is filled from
the title page; the other two read `NAME`:

- **Program Chair** — name as it should be printed
- **Dean**, Faculty of Information and Communication Studies — name as it should
  be printed

The adviser's spelling is settled: **BENIGNO JR. AGAPITO** is correct, and the
suffix belongs where it sits. His UPOU address, `benignojr.agapito@upou.edu.ph`,
carries the Jr. in the given-name half, not after the surname.

### 2. Acknowledgement

Currently `[To be supplied by the researcher.]`

The adviser's name is settled — **Benigno Jr. Agapito** — so the first line
needs only what he did. The rest of the blanks are still open.

No standard form, one page or less, most specific first. The convention is to
thank in this order, skipping anyone who does not apply:

> I thank my adviser, Benigno Jr. Agapito, for [something specific — the
> question that redirected the study, the draft he read closely, the deadline
> he held].
>
> I thank [program chair / faculty member] for [specific help], and the Faculty
> of Information and Communication Studies for [what it provided].
>
> I thank [colleagues or former teammates] at [company or "the contact centres
> where I worked"], whose shifts and whose complaints about them are the reason
> this study exists.
>
> I thank [family, partner, friends] for [specific support — the hours, the
> patience, the shifts covered].
>
> [Optional closing line: any error that remains is mine.]

**What is still needed.** One true detail per person, nothing more: what
Agapito actually did; the name of whoever chairs the programme and whoever the
Dean is, if either is to be thanked as well as signed under; the colleagues or
former teammates worth naming, or the generic "the contact centres where I
worked"; and the family or friends, with the specific support rather than the
word support.

Two notes. Specifics beat superlatives — one true sentence about what someone
actually did outranks a paragraph of thanks. And if anyone gave you domain
input, a nurse, a physician, an occupational-health officer, name them here,
because the paper states that no expert panel has been convened yet and an
acknowledged informant is not the same thing as a panel.

### 3. Contents page numbers are blank

Deliberate. Word paginates differently from the PDF build, so numbers taken from
the PDF would contradict the document they sit in. The headings are real
headings, so **References → Table of Contents** generates a live list with
correct numbers. Do it last, after any remaining edits, so the numbering is
settled.

---

## Not missing, deliberately different from the template

| Template | This paper | Why |
|---|---|---|
| "Executive Summary" and "Objectives" under Introduction | Statement of the Problem, Objectives of the Study, Significance, Scope and Limitations | The template's own contents list asks for these; the body's placeholder headings disagree with it. |
| "Socio-demographic Profile of Respondents" in Results | "Profile of the Assessed Build" | The study has no respondents. Chapter IV states the substitution rather than leaving the heading unanswered. |
| The APA style guide filling the REFERENCES chapter | The actual reference list | The guide is instructions to the writer, not part of the report. |

---

## Assets the build depends on

| File | Made by | Used for |
|---|---|---|
| `docs/report-template.docx` | the University | every formatting decision in the .docx, and all of its front matter |
| `docs/sample-paper.html` | this repo | all body content |
| `docs/figure1-conceptual-framework.png` | `docs/figure1-conceptual-framework.html`, shot by `render-figure.mjs` | Figure 1 |
| `docs/figure2-domain-scores.png` | `docs/sample-paper.html`, shot by `render-figure.mjs` | Figure 2 |

Both figures are screenshots rather than drawings, so they are regenerated by
re-running the shot. Paths may be relative:

```
node render-figure.mjs docs/figure1-conceptual-framework.html docs/figure1-conceptual-framework.png
node render-figure.mjs docs/sample-paper.html docs/figure2-domain-scores.png ".figure .chart"
```

Figure 2 has no source file of its own. Its bars are width percentages on live
divs inside Chapter IV, so the picture is a shot of the paper's own chart, and
`build-docx.mjs` swaps the picture in for the chart markup on the way into
Word. Editing the scores in the HTML therefore changes the figure only after
the shot is re-run.

`.gitignore` blanket-ignores `*.png` and exempts both figures, so the paper's
own assets stay tracked while the screenshots at the repo root do not. It also
ignores `docs/sample-paper-draft.docx`: the .docx is a build output, not a
tracked file, so a fresh clone has to run `node build-docx.mjs` before there is
anything to open.
