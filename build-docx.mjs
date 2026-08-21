/* The paper as a .docx in the BAMS Special Project template's own format.

   Not a conversion. The template (docs/report-template.docx) is opened, its
   front matter is kept exactly as it stands — title page, permission page,
   acceptance page, the UP seal, the section breaks that switch the page
   numbering from roman to arabic, the footers — and only the placeholder
   content inside it is replaced. The body is then generated from
   docs/sample-paper.html using paragraph recipes lifted out of the template
   itself, so a generated body paragraph is byte-for-byte the same
   WordprocessingML as a template body paragraph apart from its text.

   The recipes, read off the template:
     chapter heading   Arial 12 bold, centred, auto-numbered from numId 2
     section heading   Arial 12 bold, centred
     subheading        Arial 12 bold, left, double-spaced
     body paragraph    Arial 12, double-spaced, first line indented by a tab
     reference         Arial 12, double-spaced, first line indented 720 twips

   An earlier version of this script converted the HTML with html-to-docx. It
   produced a valid file in nobody's format in particular, and three separate
   schema faults Word rejected. Generating against the template is both more
   faithful and less code than fixing a converter's output.

   Run: node build-docx.mjs  ->  docs/sample-paper-draft.docx */

import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const DOCS = new URL("./docs/", import.meta.url).pathname;

/* ------------------------------- recipes -------------------------------- */

const FONT = `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Times New Roman" w:cs="Arial"/>`;
const LANG = `<w:lang w:eastAsia="en-PH"/>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rPr = ({ b, i } = {}) =>
  `<w:rPr>${FONT}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}<w:sz w:val="24"/><w:szCs w:val="24"/>${LANG}</w:rPr>`;
const run = (t, o) => `<w:r>${rPr(o)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const tabRun = () => `<w:r>${rPr()}<w:tab/></w:r>`;

/* pPr children must appear in schema order: pStyle, numPr, spacing, ind, jc,
   rPr. Word rejects the document over a wrong order, not merely ignoring it. */
const P = (runs, { jc, dbl, b, numbered, ind, tabs } = {}) =>
  `<w:p><w:pPr><w:pStyle w:val="11"/>` +
  (numbered ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>` : "") +
  (tabs ?? "") +
  (dbl ? `<w:spacing w:line="480" w:lineRule="auto"/>` : "") +
  (ind ?? (numbered ? `<w:ind w:left="284" w:hanging="284"/>` : "")) +
  (jc ? `<w:jc w:val="${jc}"/>` : "") +
  rPr({ b }) + `</w:pPr>${runs}</w:p>`;

const chapterHead = (t) => P(run(t.toUpperCase(), { b: true }), { jc: "center", b: true, numbered: true });
const sectionHead = (t) => P(run(t, { b: true }), { jc: "center", b: true });
const subHead = (t) => P(run(t, { b: true }), { b: true, dbl: true });
const subSubHead = (t) => P(run(t, { b: true, i: true }), { b: true, dbl: true });
const bodyPara = (runs) => P(tabRun() + runs, { dbl: true });
const flatPara = (runs, o = {}) => P(runs, { dbl: true, ...o });
/* APA, and docs/sample-paper.html:81 (`text-indent:-0.5in; padding-left:0.5in`),
   want the hanging indent, not a first line one. */
const refPara = (runs) => P(runs, { dbl: true, ind: `<w:ind w:left="720" w:hanging="720"/>` });
const blank = () => P("", {});

/* Word's own numbering is spent on the chapter heads (numId 2), and a second
   definition would have to be written into numbering.xml to leave that sequence
   undisturbed. The markers are written as text instead, with the hanging indent
   that aligns a wrapped item under its own text rather than under its number. */
const listItem = (marker, body) => P(run(marker) + tabRun() + body,
  { dbl: true, ind: `<w:ind w:left="720" w:hanging="360"/>` });
const pageBreak = () => `<w:p><w:r>${rPr()}<w:br w:type="page"/></w:r></w:p>`;

/* ------------------------- inline HTML -> runs -------------------------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", nbsp: " ", ndash: "–",
  mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“",
  rdquo: "”", hellip: "…", times: "×", deg: "°",
  iacute: "í", ntilde: "ñ", iuml: "ï", alpha: "α" };
/* An entity this table does not know used to pass through unchanged, and esc()
   then wrote its ampersand as &amp;, so the paper printed Clari&ntilde;o where
   it meant Clariño. Silence is the wrong answer for a document that gets
   submitted, so an unknown entity stops the build instead. */
const decode = (s) => s.replace(/&(\w+);/g, (m, e) => {
  if (!(e in ENTITIES)) throw new Error(`unknown HTML entity &${e}; \u2014 add it to ENTITIES`);
  return ENTITIES[e];
}).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

/* <b>/<strong> and <i>/<em> nest one level at most in this document, which is
   what lets a tag stack this small be correct. */
function runs(html) {
  const out = [];
  let b = 0, i = 0;
  const re = /<\/?(b|strong|i|em|code|span|sup|sub|a)\b[^>]*>|<br\s*\/?>/gi;
  let last = 0, m;
  const push = (text) => { if (text) out.push(run(decode(text), { b: b > 0, i: i > 0 })); };
  while ((m = re.exec(html))) {
    push(html.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = (m[1] || "br").toLowerCase();
    const close = m[0].startsWith("</");
    if (tag === "b" || tag === "strong") b += close ? -1 : 1;
    else if (tag === "i" || tag === "em") i += close ? -1 : 1;
    else if (tag === "br") out.push(`<w:r>${rPr()}<w:br/></w:r>`);
  }
  push(html.slice(last));
  return out.join("");
}
const plain = (html) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/* -------------------------------- tables -------------------------------- */

const BORDER = ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join("");

function table(html, usableWidth) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, r]) =>
    [...r.matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/\1>/g)]
      .map(([, tag, attrs, cell]) => ({
        head: tag === "th", cell,
        pct: parseFloat((attrs.match(/width:([\d.]+)%/) || [])[1]) || null,
      })));
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  /* Every table in the paper sizes all its header cells but the last, which is
     meant to take whatever is left; requiring a width on every cell threw the
     declared ones away and made all fourteen tables uniform. */
  const pcts = rows[0].map((c) => c.pct);
  const known = pcts.reduce((s, p) => s + (p ?? 0), 0);
  const rest = (100 - known) / (pcts.filter((p) => !p).length || 1);
  const widths = pcts.length === cols && known > 0
    ? pcts.map((p) => Math.round(((p ?? rest) / 100) * usableWidth))
    : Array.from({ length: cols }, () => Math.round(usableWidth / cols));

  /* b on the paragraph mark bolds the mark, not the text, and no <th> in the
     HTML carries its own <b>, so the header row has to be wrapped here. */
  const cell = ({ head, cell }, w) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>` +
    P(runs(head ? `<b>${cell}</b>` : cell), { b: head }) + `</w:tc>`;

  return `<w:tbl><w:tblPr><w:tblW w:w="${usableWidth}" w:type="dxa"/>` +
    `<w:tblBorders>${BORDER}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    rows.map((r, i) => `<w:tr><w:trPr><w:cantSplit/>${i ? "" : "<w:tblHeader/>"}</w:trPr>` +
      r.map((c, n) => cell(c, widths[n] ?? widths[0])).join("") + `</w:tr>`).join("") +
    `</w:tbl>`;
}

/* --------------------------- the paper's body --------------------------- */

const paper = readFileSync(`${DOCS}sample-paper.html`, "utf8")
  .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/g, "")
  /* Figure 2 is a bar chart drawn in CSS, so its bars are width percentages on
     empty spans and arrive here as nothing at all. render-figure.mjs shoots the
     same chart from the same page, and the picture stands in for it. The
     lookahead is what ends the match: the chart's own nested divs would
     otherwise stop a non-greedy [\s\S]*? at the first bar's closing tag. */
  .replace(/<div class="chart">[\s\S]*?<\/div>\s*(?=<p class="flush"><i>Figure 2\.)/,
    '<p><img src="figure2-domain-scores.png"></p>');

const between = (from, to) => {
  const a = paper.indexOf(from);
  const b = to ? paper.indexOf(to, a) : paper.length;
  return paper.slice(a, b);
};

/* Chapters I and V head their sections the way the template heads Rationale
   and Recommendations, centred; II, III and IV carry topic subheadings, which
   the template sets left and bold. */
const CENTRED_SECTIONS = new Set(["I", "V"]);

function convert(html, usableWidth) {
  const out = [];
  let chapter = "";
  /* the heading's attributes are kept: class="pb" is where the HTML says a
     chapter starts a fresh page, and dropping it dropped all seven breaks */
  const re = /<h([234])([^>]*)>([\s\S]*?)<\/h\1>|<table[^>]*>[\s\S]*?<\/table>|<div class="figure">[\s\S]*?<\/div>|<div class="refs">[\s\S]*?<\/div>|<[ou]l[^>]*>[\s\S]*?<\/[ou]l>|<p([^>]*)>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    const chunk = m[0];

    if (m[1]) {                                   // heading
      const text = plain(m[3]);
      const num = text.match(/^(I|II|III|IV|V)\.\s+(.*)$/);
      if (/\bpb\b/.test(m[2])) out.push(pageBreak());
      if (m[1] === "2") {
        if (num) { chapter = num[1]; out.push(chapterHead(num[2])); }
        else {
          chapter = "";
          out.push(sectionHead(text.toUpperCase()));
          /* template para 771: Appendices stands alone on a divider page */
          if (text.toLowerCase() === "appendices") out.push(pageBreak());
        }
      } else if (m[1] === "3") {
        /* the template heads an appendix APPENDIX A, its title beneath */
        const apx = text.match(/^Appendix ([A-Z])\.\s+(.*)$/);
        if (apx) out.push(sectionHead(`APPENDIX ${apx[1]}`),
          flatPara(runs(apx[2]), { jc: "center" }));   // the title line is not bold
        /* chapter === "" is the appendix run, which the template centres too */
        else out.push(chapter === "" || CENTRED_SECTIONS.has(chapter)
          ? sectionHead(text) : subHead(text));
      } else {
        out.push(subSubHead(text));
      }
      continue;
    }

    if (chunk.startsWith("<table")) {
      const cap = chunk.match(/<caption>([\s\S]*?)<\/caption>/);
      if (cap) for (const line of cap[1].split(/<br\s*\/?>/)) out.push(flatPara(runs(line)));
      out.push(table(chunk, usableWidth), blank());
      continue;
    }

    /* The HTML puts one italic caption line under the image. APA — and the
       paper's own table captions — want bold "Figure N", the title italic
       beneath it, and both above the picture. */
    if (chunk.startsWith('<div class="figure"')) {
      const paras = [...chunk.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g)].map((x) => x[2]);
      for (const cap of paras.filter((p) => !/<img/.test(p))) {
        const num = cap.match(/^\s*<i>Figure (\d+)\.<\/i>\s*([\s\S]*)$/);
        if (num) out.push(flatPara(runs(`<b>Figure ${num[1]}</b>`)), flatPara(runs(`<i>${num[2]}</i>`)));
        else out.push(flatPara(runs(cap), { jc: "center" }));
      }
      const img = paras.map((p) => p.match(/<img[^>]*src="([^"]+)"/)).find(Boolean);
      if (img) out.push(picture(img[1]));
      continue;
    }

    if (/^<[ou]l/.test(chunk)) {
      let n = 0;
      const ordered = chunk[1] === "o";
      for (const [, item] of chunk.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g))
        out.push(listItem(ordered ? `${++n}.` : "\u2022", runs(item)));
      out.push(blank());
      continue;
    }

    if (chunk.startsWith('<div class="refs"')) {
      for (const [, , inner] of chunk.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g))
        out.push(refPara(runs(inner)));
      continue;
    }

    /* class="flush" is the HTML's mark for a continuation paragraph — one that
       follows a heading or a figure — and takes no first-line indent */
    const text = m[5];
    if (plain(text)) out.push(/flush/.test(m[4]) ? flatPara(runs(text)) : bodyPara(runs(text)));
  }
  return out;
}

/* ------------------------------ the package ----------------------------- */

const zip = await JSZip.loadAsync(readFileSync(`${DOCS}report-template.docx`));
const doc = await zip.file("word/document.xml").async("string");

/* the body-level section properties, which must stay the last child of
   <w:body>; the wholesale body replacement below would otherwise drop them */
const pgSz = doc.match(/<w:pgSz w:w="(\d+)"/);
const pgMar = doc.match(/<w:pgMar[^>]*w:right="(\d+)"[^>]*w:left="(\d+)"/)
  ?? doc.match(/<w:pgMar[^>]*w:left="(\d+)"[^>]*w:right="(\d+)"/);
const usable = +pgSz[1] - (+pgMar[1] + +pgMar[2]);

/* ------------------------------- pictures -------------------------------- */

/* A PNG states its pixel dimensions in the IHDR chunk, which is always the
   first chunk: eight bytes of signature, four of length, four of type, then
   width and height as big-endian 32-bit integers. */
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

const EMU_PER_TWIP = 635;
const rels = await zip.file("word/_rels/document.xml.rels").async("string");
let nextRel = Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1;
const added = [];

/* Every figure is drawn at the width of the text column, whatever its pixel
   size, with the height following from its own aspect ratio. */
const picture = (file) => {
  const bytes = readFileSync(`${DOCS}${file}`);
  const { w, h } = pngSize(bytes);
  const cx = usable * EMU_PER_TWIP, cy = Math.round(cx * h / w);
  const id = `rId${nextRel++}`, name = file.replace(/[^\w.-]/g, "");
  added.push({ id, name, bytes });
  return `<w:p><w:pPr><w:pStyle w:val="11"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${nextRel}" name="${esc(name)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
};

const head = doc.slice(0, doc.indexOf("<w:body>") + 8);
const body = doc.slice(doc.indexOf("<w:body>") + 8, doc.lastIndexOf("</w:body>"));
/* The self-closing branch has to come first and has to accept attributes:
   the template writes its blank paragraphs as <w:p w14:paraId="…"/>, and the
   paired branch's [^>]* ate the attributes and then ran on to the next
   </w:p>, merging whole runs of paragraphs into one block. The trailing
   bookmarkEnd branch is what makes the pattern tile the body exactly. */
const blocks = body.match(/<w:p[^>]*\/>|<w:p [^>]*>[\s\S]*?<\/w:p>|<w:p>[\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>|<w:bookmark(?:Start|End)[^>]*\/>/g);

const SECTPR = blocks[blocks.length - 1].startsWith("<w:sectPr") ? blocks[blocks.length - 1] : "";

const textOf = (b) => (b.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
  .map((t) => t.replace(/<[^>]+>/g, "")).join("").replace(/\s+/g, " ").trim();

/* Headings only: the contents list carries rows reading "List of Tables" and
   "List of Figures" too, and matching on text alone anchors to the row rather
   than to the section it points at, which silently eats the rest of the list.
   A heading in this template is centred and bold; a contents row is neither. */
const isHeading = (b) => b.includes('<w:jc w:val="center"/>') && b.includes("<w:b/>");
const findHeading = (text) => {
  const at = blocks.findIndex((b) => isHeading(b) &&
    textOf(b).toLowerCase().startsWith(text.toLowerCase()));
  if (at < 0) throw new Error(`front matter heading not found: ${text}`);
  return at;
};

/* Every splice is planned against the pristine block list and applied last
   first, so that an earlier anchor is never shifted by a later edit. */
const edits = [];
const replaceAfter = (heading, stop, newBlocks) => {
  const at = findHeading(heading);
  let end = at + 1;
  while (end < blocks.length && !stop(blocks[end], textOf(blocks[end]))) end++;
  edits.push({ at: at + 1, count: end - (at + 1), newBlocks });
};

/* the template writes its filler as "Xxxxxxxx", one capital and the rest
   lower, so a case-sensitive X{4,} matches none of it and every placeholder
   survives the replacement that was meant to remove it */
/* Title-page and acceptance-page fields the template leaves blank. Each key is
   the full text of one run in the template, which is how they happen to be
   split, so an exact run match is enough and no run has to be re-cut.
   The three acceptance-page signatories are filled below in SIGNATORIES, not
   here, because the template gives all three the same run text. */
const TITLE = "INTERACTIVE PLANNER: CIRCADIAN-AWARE PLANNER FOR NIGHT-SHIFT WORKERS: TIMING CAFFEINE, NAPS, AND MICRO-CARE";
const FIELDS = {
  "GABRELLA ANG": "GABRELLA C. ANG",
  "Day Month Year": "August 24, 2026",
  "TITLE": TITLE,
  "AUTHOR’S NAME ": "Gabrella C. Ang ",
  "“XXXXXXXXXXXXXX”": `“${TITLE}”`,
  "is hereby accepted by the Faculty of Information and Communication Studies, U.P. Open University, in partial fulfillment of the requirements for the degree Course.":
    "is hereby accepted by the Faculty of Information and Communication Studies, U.P. Open University, in partial fulfillment of the requirements for the degree Bachelor of Arts in Multimedia Studies.",
};
const fillFields = (b) => b.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
  (m, open, text, close) => FIELDS[text] ? open + esc(FIELDS[text]) + close : m);

const isPlaceholder = (t) => /^x{4,}/i.test(t);
const stopAtRealText = (b, t) => t && !isPlaceholder(t);

/* -- biographical sketch and acknowledgement -- */
const frontText = (heading) => {
  const first = paper.indexOf(`<h2>${heading}</h2>`);
  const next = paper.indexOf("<h2>", first + 5);
  return [...paper.slice(first, next).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => x[1]);
};
/* The template separates these with runs of blank paragraphs — 15 before the
   Acknowledgement, 40 before the contents — which the replacement above
   consumes. One explicit break says the same thing and cannot drift. */
replaceAfter("Biographical Sketch", stopAtRealText,
  frontText("Biographical Sketch").map((t) => bodyPara(runs(t))).concat(pageBreak()));
replaceAfter("Acknowledgement", stopAtRealText,
  frontText("Acknowledgement").map((t) => bodyPara(runs(t))).concat(pageBreak()));

/* -- contents page numbers ------------------------------------------------
   Word paginates differently from the PDF build, so any number computed here
   would contradict the document it sits in. PAGEREF fields let Word compute
   them itself: every contents row points at a bookmark on its own target, and
   settings.xml is told to refresh all fields when the file is opened. The
   number a reader sees is therefore Word's, taken from the page the heading
   actually landed on. */
const RIGHT_TAB = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${usable}"/></w:tabs>`;
const marks = new Map();          // data-toc -> bookmark name
const markName = (key) => {
  if (!marks.has(key)) marks.set(key, `gyToc${marks.size}`);
  return marks.get(key);
};
const pageRef = (name) =>
  `<w:r>${rPr()}<w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r>${rPr()}<w:instrText xml:space="preserve"> PAGEREF ${name} \\h </w:instrText></w:r>` +
  `<w:r>${rPr()}<w:fldChar w:fldCharType="separate"/></w:r>` +
  `<w:r>${rPr()}<w:t>1</w:t></w:r>` +
  `<w:r>${rPr()}<w:fldChar w:fldCharType="end"/></w:r>`;

/* Bookmarks are placed by matching the row's target text against a block's own
   text. A contents row is never its own target, so the rows generated here are
   remembered and skipped. Ids start past the two the template already uses. */
const tocRowXml = new Set();
let bmId = 100;
const bookmark = (block, name) => {
  const id = bmId++;
  return block.replace(/(<w:p\b[^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?)/,
    `$1<w:bookmarkStart w:id="${id}" w:name="${name}"/>`)
    .replace(/<\/w:p>$/, `<w:bookmarkEnd w:id="${id}"/></w:p>`);
};
const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
/* A chapter's roman numeral is Word's, from numId 2, so it is in the contents
   row but never in the heading's own text; a figure row ends in a full stop its
   caption does not carry. Both are stripped before the loosest comparison. */
const bare = (s) => norm(s).replace(/^[ivx]+\.\s*/, "").replace(/\.$/, "");
/* Three passes per target, strictest first: a block whose whole text is the
   target, then one that contains it — which is what a table caption needs,
   since "Table 6" and its title are one paragraph — then the bare forms. */
const placeMarks = (arr, pending) => {
  for (const [key, name] of [...pending]) {
    const want = norm(key), loose = bare(key);
    const free = (x) => !tocRowXml.has(x);
    let at = arr.findIndex((x) => free(x) && norm(textOf(x)) === want);
    if (at < 0) at = arr.findIndex((x) => free(x) && norm(textOf(x)).includes(want));
    if (at < 0) at = arr.findIndex((x) => free(x) && bare(textOf(x)) === loose);
    if (at < 0) at = arr.findIndex((x) => free(x) && bare(textOf(x)).startsWith(loose));
    if (at >= 0) { arr[at] = bookmark(arr[at], name); pending.delete(key); }
  }
};

/* -- table of contents and the two lists -- */
const tocRows = (from, to) =>
  [...between(from, to).matchAll(
    /<p(?: class="([^"]*)")?><span>([\s\S]*?)<\/span>[\s\S]*?<span class="pn"[^>]*data-toc="([^"]*)"/g)]
    .map(([, cls, label, target]) => {
      /* A sub-entry is indented, not tabbed in. The only tab stop on the row
         is the right one that carries the dot leader, so a leading tab ran
         straight to the right margin: the label printed flush right behind a
         line of dots and pushed its page number onto a line of its own. The
         0.35in matches docs/sample-paper.html:99. */
      const row = flatPara(
        run(plain(label)) + tabRun() + pageRef(markName(decode(target))),
        { dbl: false, tabs: RIGHT_TAB,
          ind: (cls ?? "").includes("l2") ? `<w:ind w:left="504"/>` : "" });
      tocRowXml.add(row);
      return row;
    });

replaceAfter("TABLE OF CONTENTS", (b) => isHeading(b),
  tocRows("<h2>Table of Contents</h2>", "<h2>List of Tables</h2>").concat(blank()));
replaceAfter("List of Tables", (b) => isHeading(b),
  tocRows("<h2>List of Tables</h2>", "<h2>List of Figures</h2>").concat(blank()));
/* The template names a List of Appendices in its contents but never defines the
   section, so unlike the other two lists there is no heading to replace after.
   It is written here instead, onto the page the List of Figures ends, which is
   why this one call emits two sections rather than one. */
replaceAfter("List of Figures", (b) => isHeading(b),
  tocRows("<h2>List of Figures</h2>", "<h2>List of Appendices</h2>").concat(
    pageBreak(), sectionHead("List of Appendices"),
    tocRows("<h2>List of Appendices</h2>", "<h2>Abstract</h2>"), blank()));

/* -- abstract, up to the section break that starts the numbered body -- */
/* the template sets the Keywords label bold, the HTML italic */
const abstractParas = [...between("<h2>Abstract</h2>", "<h2>I. Introduction")
  .matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
  .map((x) => x[1].replace("<i>Keywords:</i>", "<b>Keywords:</b>"));
replaceAfter("Abstract", (b) => b.includes("<w:sectPr"),
  abstractParas.map((t) => bodyPara(runs(t))).concat(blank()));

/* the front matter ends at the section break after the abstract; everything
   the template held after it is placeholder body, and is replaced wholesale */
const abstractAt = findHeading("Abstract");
const bodyStart = blocks.findIndex((b, i) => i > abstractAt && b.includes("<w:sectPr"));
/* That break shares its paragraph with the first item of the chapter
   numbering, so keeping the break as it stands spends "I." on an empty
   paragraph and opens the report at Chapter II. The numbering is stripped and
   the break kept. */
edits.push({
  at: bodyStart, count: blocks.length - bodyStart,
  newBlocks: [blocks[bodyStart].replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, "")],
});

for (const e of edits.sort((a, b) => b.at - a.at)) blocks.splice(e.at, e.count, ...e.newBlocks);

/* -- permission page classifications --

   The four Yes/No pairs are floating rectangles rather than form fields, two to
   a row: the box at roughly 708000 EMU from the column is Yes, the one at
   1826000 is No. Neither carries a text frame, so a tick has to be a filled box
   rather than an X in one. Both halves of the AlternateContent are filled, as
   Word draws the DrawingML and older readers fall back to the VML.

   Invention No, because nothing here is filed or being filed for a patent, and
   the paper already discloses the rule set in full. Publication and Free Yes,
   which is the permission the page's own text grants. Confidential No, because
   the study collects nothing from end users and holds no third-party material,
   as Chapter III and Appendix B both state. */
const TICKED = ["Rectangle 112", "Rectangle 9", "Rectangle 117", "Rectangle 36"];
let ticks = 0;
/* a:solidFill and its siblings are a choice inside CT_ShapeProperties, one fill
   to a shape. Rectangle 36 already carries a white one, so adding a black fill
   after </a:prstGeom> left that shape with two, and Word refuses to open the
   file rather than taking the first. The existing fill is replaced where there
   is one and only added where there is none. */
const BLACK = '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>';
const FILL = /<\/a:prstGeom>(?:<a:(no|solid|grad|blip|patt|grp)Fill(?:\/>|[\s\S]*?<\/a:\1Fill>))?/;
const tickBox = (b, name) => {
  const at = b.indexOf(`name="${name}"`);
  if (at < 0) return b;
  const from = b.lastIndexOf("<mc:AlternateContent", at);
  const end = b.indexOf("</mc:AlternateContent>", at) + "</mc:AlternateContent>".length;
  ticks++;
  return b.slice(0, from) + b.slice(from, end)
    .replace(FILL, `</a:prstGeom>${BLACK}`)
    .replace(/fillcolor="#FFFFFF[^"]*"/, 'fillcolor="#000000"') + b.slice(end);
};

const keep = blocks.map((b) => TICKED.reduce(tickBox, fillFields(b)));
if (ticks !== TICKED.length)
  throw new Error(`permission page: ticked ${ticks} of ${TICKED.length} boxes; the template's rectangles have been renumbered`);

/* Three signature blocks read "NAME" and are identical, so they are told apart
   by position, in the order the acceptance page prints them: adviser, program
   chair, dean. The adviser is spelled as the title page spells him, suffix and
   all; the other two are the officeholders named by the Faculty of Information
   and Communication Studies, and their suffix convention differs from his. */
const SIGNATORIES = ["BENIGNO JR. AGAPITO", "DIEGO S. MARANAN", "ROBERTO B. FIGUEROA JR."];
let signed = 0;
for (let i = 0; i < keep.length && signed < SIGNATORIES.length; i++)
  if (textOf(keep[i]) === "NAME")
    keep[i] = keep[i].replace(/(<w:t[^>]*>)NAME(<\/w:t>)/, `$1${SIGNATORIES[signed++]}$2`);
if (signed !== SIGNATORIES.length)
  throw new Error(`acceptance page: filled ${signed} of ${SIGNATORIES.length} signature blocks`);
const tail = "";
const generated = convert(paper.slice(paper.indexOf("<h2>I. Introduction</h2>")), usable);

/* Front matter first, then the body, so a target named in both — "List of
   Tables" is a heading and a contents row — resolves to the earlier one. Any
   target left unplaced would render as "Error! Bookmark not defined." on the
   page, so the build stops instead. */
const pending = new Map(marks);
placeMarks(keep, pending);
placeMarks(generated, pending);
if (pending.size)
  throw new Error(`contents: no bookmark target for ${[...pending.keys()].join(", ")}`);

const out = head + keep.join("") + blank() + generated.join("") + SECTPR + "</w:body></w:document>";

/* The contents rows carry PAGEREF fields, which hold a stale placeholder until
   something recalculates them. updateFields makes Word do it on open, so the
   numbers are right the first time the file is read rather than after a manual
   F9. Word asks once, on open, before it updates. This is the one part of
   settings.xml that is no longer byte-identical to the template. */
{
  const path = "word/settings.xml";
  const s = await zip.file(path).async("string");
  if (!/w:updateFields/.test(s)) {
    /* CT_Settings is a sequence, and Word refuses the file outright on a wrong
       order rather than ignoring the element. updateFields belongs late: after
       characterSpacingControl, immediately before hdrShapeDefaults/footnotePr/
       endnotePr/compat. Anchoring it to the first of those that the template
       actually has is what keeps it in sequence. */
    const after = s.match(/<w:(?:hdrShapeDefaults|footnotePr|endnotePr|compat)[ >]/);
    if (!after) throw new Error("settings.xml: no element found to place updateFields before");
    zip.file(path, s.slice(0, after.index) + `<w:updateFields w:val="true"/>` + s.slice(after.index));
  }
}

/* the figures, their relationships, and the content type that lets Word know
   what a .png part is — the template already declares it for the UP seal, so
   the Default is only added if the package somehow lacks one */
for (const { id, name, bytes } of added) zip.file(`word/media/${name}`, bytes);
if (added.length) {
  zip.file("word/_rels/document.xml.rels", rels.replace("</Relationships>",
    added.map(({ id, name }) =>
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`
    ).join("") + "</Relationships>"));

  const ct = await zip.file("[Content_Types].xml").async("string");
  if (!/Extension="png"/.test(ct)) zip.file("[Content_Types].xml", ct.replace("<Types",
    (m) => m).replace(/(<Types[^>]*>)/,
    `$1<Default Extension="png" ContentType="image/png"/>`));
}

/* The body footer is the running head. The template leaves it as the literal
   "Title… ", and settings.xml sets no evenAndOddHeaders, so that placeholder
   prints on every page of the body until it is filled in. */
const footer = await zip.file("word/footer3.xml").async("string");
const running = footer.replace(/(<w:t[^>]*>)Title…\s*(<\/w:t>)/, "$1Interactive Planner $2");
if (running === footer) throw new Error("word/footer3.xml: the Title… placeholder has moved");
zip.file("word/footer3.xml", running);

zip.file("word/document.xml", out);
writeFileSync(`${DOCS}sample-paper-draft.docx`,
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`built docs/sample-paper-draft.docx — ${generated.length} generated blocks, ${keep.length} kept from the template`);
