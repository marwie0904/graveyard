# Missing items — `sample-paper-draft.docx`

What the BAMS template asks for that the build cannot supply. Everything else in
`docs/report-template.docx` is filled, either from the template itself or from
`docs/sample-paper.html`.

Rebuild after any change here: `node build-docx.mjs`. **Close the file in Word
first.** Word holds an open document in memory and does not reload it when the
file changes underneath; saving from a stale window writes the old content back
over the rebuild.

---

## Closed

| Item | What it holds now |
|---|---|
| Author, title page | GABRELLA C. ANG |
| Submission date, title page and acceptance page | August 20, 2026 |
| Title, permission page | INTERACTIVE PLANNER: CIRCADIAN-AWARE PLANNER FOR NIGHT-SHIFT WORKERS: TIMING CAFFEINE, NAPS, AND MICRO-CARE |
| Author and title, acceptance sentence | Gabrella C. Ang / the title above |
| Degree, acceptance sentence | Bachelor of Arts in Multimedia Studies — the template read "the degree Course" |
| Adviser, signature block | BENIGNO JR. AGAPITO, copied from the title page |
| **Figure 1** | Drawn and embedded: an input–process–output diagram with the six shift phases as the process ring. Source `docs/figure1-conceptual-framework.html`, rendered by `node render-figure.mjs`. |
| **Figure 2** | Was missing entirely from the .docx, not only unfinished: the bar chart is drawn in CSS, so it arrived as nothing and only the caption survived. Now rendered from the paper's own chart and embedded. |
| **Basis for the conceptual framework** | The section had no citation at all. It now grounds the input–process–output structure in design science research, citing Hevner et al. (2004), Hevner (2007), and Peffers et al. (2007), all three added to the reference list. |
| **Biographical sketch** | Written from the researcher's own answers and CV: eight years of night shift from 2018, four of them at a contact centre in Rizal, the named progression through it, the current Operations Manager role and its team of thirty-five, and the hair loss and insomnia the study came out of. Third person, per the template convention. Employers are unnamed by request. |
| **Research Design** | Chapter III now names the paradigm Chapter II cites. Two additions: a paragraph calling the study a design science study (Hevner et al., 2004), drawing the consequence the panel asks about — no independent and dependent variables, because evaluation is artifact-based — and placing the report on the Peffers et al. (2007) process model chapter by chapter; and a replacement for the sentence that offered future expert validation as the only evaluation, which now names the rubric and the verification suite as what actually evaluated the build, keeping expert validation as the future step it is in Chapter V. Domínguez (2017) stays. |

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

### 2. Permission page classifications

Four Yes/No pairs, none ticked. They are the UP IPR classifications, and they
govern what the University may do with the work.

| Classification | Suggested | Why |
|---|---|---|
| Invention (I) | **No** | Nothing here is filed or being filed for a patent. Answer Yes only if you intend to protect the planner as an invention, in which case disclosure is normally deferred and the rest of these answers change with it. |
| Publication (P) | **Yes** | This is the permission the page's own text grants, and the paper is written to be read. |
| Confidential (C) | **No** | The study collects no data from end users, uses no employer data, and holds no third-party material under agreement. It says so in Chapter III and again in Appendix B. |
| Free (F) | **Yes** | Consistent with granting open access, which the quoted licence text already asks you to allow. |

The one genuine decision is **Invention**. Everything else follows from it: if
you intend to commercialise the planner, say so before signing, because the
paper as written already publishes the rule set, the timing logic, and the
citation table in full, which is disclosure.

### 3. Acknowledgement

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

### 4. Contents page numbers are blank

Deliberate. Word paginates differently from the PDF build, so numbers taken from
the PDF would contradict the document they sit in. The headings are real
headings, so **References → Table of Contents** generates a live list with
correct numbers. Do it last, after any remaining edits, so the numbering is
settled.

### 5. List of Appendices has no section

The template's contents list names one, but the template never defines the
section. The two appendices are present in the body and in the contents list.
Nothing to fix unless your reader wants the separate page, which is one heading
and two lines if so.

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
