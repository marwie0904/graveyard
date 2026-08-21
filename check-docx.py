"""Check the OOXML element sequences Word enforces strictly.

Word rejects a document outright when a child appears out of the order its
complex type declares. These are the sequences this build actually touches.
Only elements present in the file are compared, so a partial sequence is fine
as long as the ones there are in order.
"""
import re, sys, zipfile

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# CT_PPrBase, in schema order
PPR = """pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr
suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap
overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd
snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc
textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle
rPr sectPr pPrChange""".split()

# CT_Settings, in schema order (the part any real template uses)
SETTINGS = """writeProtection view zoom removePersonalInformation removeDateAndTime
doNotDisplayPageBoundaries displayBackgroundShape printPostScriptOverText
printFractionalCharacterWidth printFormsData embedTrueTypeFonts embedSystemFonts
saveSubsetFonts saveFormsData mirrorMargins alignBordersAndEdges
bordersDoNotSurroundHeader bordersDoNotSurroundFooter gutterAtTop
hideSpellingErrors hideGrammaticalErrors activeWritingStyle proofState formsDesign
attachedTemplate linkStyles stylePaneFormatFilter stylePaneSortMethod documentType
mailMerge revisionView trackChanges doNotTrackMoves doNotTrackFormatting
documentProtection autoFormatOverride styleLockTheme styleLockQFSet defaultTabStop
autoHyphenation consecutiveHyphenLimit hyphenationZone doNotHyphenateCaps
showEnvelope summaryLength clickAndTypeStyle defaultTableStyle evenAndOddHeaders
bookFoldRevPrinting bookFoldPrinting bookFoldPrintingSheets
drawingGridHorizontalSpacing drawingGridVerticalSpacing
displayHorizontalDrawingGridEvery displayVerticalDrawingGridEvery
doNotUseMarginsForDrawingGridOrigin drawingGridHorizontalOrigin
drawingGridVerticalOrigin doNotShadeFormData noPunctuationKerning
characterSpacingControl printTwoOnOne strictFirstAndLastChars noLineBreaksAfter
noLineBreaksBefore savePreviewPicture doNotValidateAgainstSchema saveInvalidXml
ignoreMixedContent alwaysShowPlaceholderText doNotDemarcateInvalidXml
saveXmlDataOnly useXSLTWhenSaving saveThroughXslt showXMLTags
alwaysMergeEmptyNamespace updateFields hdrShapeDefaults footnotePr endnotePr
compat docVars rsids mathPr uiCompat48 attachedSchema themeFontLang
clrSchemeMapping doNotIncludeSubdocsInStats doNotAutoCompressPictures
forceUpgrade captions readModeInkLockDown smartTagType schemaLibrary
shapeDefaults doNotEmbedSmartTags decimalSymbol listSeparator""".split()

# CT_RPr, the subset this build emits
RPR = """rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow
emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position
sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout
specVanish oMath""".split()


def check(seq_name, order, blocks, label):
    idx = {n: i for i, n in enumerate(order)}
    bad = []
    for n, block in enumerate(blocks):
        kids = re.findall(r"<w:([a-zA-Z]+)[ />]", block)
        # drop the wrapper itself
        kids = [k for k in kids if k != seq_name]
        pos, last, lastname = [], -1, None
        for k in kids:
            if k not in idx:
                continue
            i = idx[k]
            if i < last:
                bad.append((n, lastname, k))
                break
            last, lastname = i, k
    if bad:
        print("  FAIL %s: %d out-of-order" % (label, len(bad)))
        for n, a, b in bad[:5]:
            print("     block %d: <w:%s> before <w:%s>" % (n, a, b))
    else:
        print("  ok   %s (%d checked)" % (label, len(blocks)))
    return len(bad)


path = sys.argv[1]
z = zipfile.ZipFile(path)
doc = z.read("word/document.xml").decode("utf-8")
setg = z.read("word/settings.xml").decode("utf-8")

fails = 0
print("schema sequence check: %s" % path)
fails += check("pPr", PPR, re.findall(r"<w:pPr>.*?</w:pPr>", doc, re.S), "w:pPr")
fails += check("rPr", RPR, re.findall(r"<w:rPr>.*?</w:rPr>", doc, re.S), "w:rPr")
fails += check("settings", SETTINGS, [setg], "w:settings")

# bookmarks balanced and unique
st = re.findall(r'<w:bookmarkStart w:id="(\d+)"', doc)
en = re.findall(r'<w:bookmarkEnd w:id="(\d+)"', doc)
if sorted(st) != sorted(en):
    print("  FAIL bookmarks: %d start / %d end, ids differ" % (len(st), len(en))); fails += 1
elif len(st) != len(set(st)):
    print("  FAIL bookmarks: duplicate ids"); fails += 1
else:
    print("  ok   bookmarks (%d, balanced, unique ids)" % len(st))

# one fill to a shape: a:solidFill and its siblings are a choice in
# CT_ShapeProperties, and Word refuses the file over a second one
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
WPS = "{http://schemas.microsoft.com/office/word/2010/wordprocessingShape}"
FILLS = {A + n for n in
         ("noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill")}
import xml.etree.ElementTree as ET
shapes = list(ET.fromstring(doc.encode("utf-8")).iter(WPS + "spPr"))
extra = [(i, [c.tag.replace(A, "a:") for c in sp if c.tag in FILLS])
         for i, sp in enumerate(shapes)
         if len([c for c in sp if c.tag in FILLS]) > 1]
if extra:
    print("  FAIL wps:spPr: %d shape(s) with more than one fill" % len(extra))
    for i, f in extra[:5]:
        print("     shape %d: %s" % (i, ", ".join(f)))
    fails += 1
else:
    print("  ok   wps:spPr (%d shapes, at most one fill each)" % len(shapes))

# every PAGEREF resolves
names = set(re.findall(r'w:name="([^"]+)"', doc))
refs = set(re.findall(r"PAGEREF (\S+)", doc))
missing = refs - names
if missing:
    print("  FAIL PAGEREF: unresolved %s" % sorted(missing)[:5]); fails += 1
else:
    print("  ok   PAGEREF (%d refs, all resolve)" % len(refs))

# field runs balanced
beg = len(re.findall(r'w:fldCharType="begin"', doc))
end = len(re.findall(r'w:fldCharType="end"', doc))
sep = len(re.findall(r'w:fldCharType="separate"', doc))
if not (beg == end == sep):
    print("  FAIL fldChar: begin=%d separate=%d end=%d" % (beg, sep, end)); fails += 1
else:
    print("  ok   fldChar (%d complete fields)" % beg)

print("\n%s" % ("PASS" if not fails else "FAIL — %d problem(s)" % fails))
sys.exit(1 if fails else 0)
