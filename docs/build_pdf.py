# -*- coding: utf-8 -*-
"""Genere les manuels PDF livres au client.

Produit deux documents dans `docs/` :
  - Guide-Installation-et-Demarrage.pdf  : mise en service par le commercant.
  - Guide-Tests-et-Depannage.pdf         : recette et diagnostic.

Usage :  python docs/build_pdf.py
"""
import os
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, ListFlowable, ListItem
)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_NAME = "Gestion Pièces Cycles & Motos"
VERSION = "2.0.0"
TODAY = date.today().strftime("%d/%m/%Y")

# Palette alignee sur celle de l'application.
NAVY = colors.HexColor("#0f172a")
BLUE = colors.HexColor("#2563eb")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#f1f5f9")
BORDER = colors.HexColor("#cbd5e1")
GREEN = colors.HexColor("#047857")
AMBER = colors.HexColor("#b45309")
RED = colors.HexColor("#be123c")

# Les polices Type1 intégrées de ReportLab ne couvrent pas correctement les
# accents français ni les symboles : on enregistre des polices TrueType système,
# qui sont pleinement Unicode. Le texte reste ainsi sélectionnable et copiable.
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONTS_DIR = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")

FONT_REGULAR, FONT_BOLD, FONT_MONO, FONT_ITALIC = "Helvetica", "Helvetica-Bold", "Courier", "Helvetica-Oblique"

_CANDIDATES = [
    ("Doc", "segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf"),
    ("Doc", "calibri.ttf", "calibrib.ttf", "calibrii.ttf"),
    ("Doc", "arial.ttf", "arialbd.ttf", "ariali.ttf"),
]

for family, regular, bold, italic in _CANDIDATES:
    reg_path = os.path.join(FONTS_DIR, regular)
    bold_path = os.path.join(FONTS_DIR, bold)
    if not (os.path.exists(reg_path) and os.path.exists(bold_path)):
        continue
    try:
        pdfmetrics.registerFont(TTFont(family, reg_path))
        pdfmetrics.registerFont(TTFont(family + "-Bold", bold_path))
        FONT_REGULAR, FONT_BOLD = family, family + "-Bold"
        italic_path = os.path.join(FONTS_DIR, italic)
        if os.path.exists(italic_path):
            pdfmetrics.registerFont(TTFont(family + "-Italic", italic_path))
            FONT_ITALIC = family + "-Italic"
        else:
            FONT_ITALIC = family
        pdfmetrics.registerFontFamily(family, normal=FONT_REGULAR, bold=FONT_BOLD, italic=FONT_ITALIC)
        break
    except Exception as err:  # police illisible : on passe à la suivante
        print("  police ignorée (%s) : %s" % (regular, err))

for mono, mono_bold in (("consola.ttf", "consolab.ttf"), ("cour.ttf", "courbd.ttf")):
    mono_path = os.path.join(FONTS_DIR, mono)
    if not os.path.exists(mono_path):
        continue
    try:
        pdfmetrics.registerFont(TTFont("DocMono", mono_path))
        FONT_MONO = "DocMono"
        break
    except Exception:
        continue


def clean(text):
    """Les polices TrueType couvrent l'Unicode : rien à assainir."""
    return text


# --------------------------------------------------------------------------- styles
base = getSampleStyleSheet()

S = {
    "title": ParagraphStyle("t", parent=base["Title"], fontName=FONT_BOLD,
                            fontSize=26, leading=31, textColor=NAVY, spaceAfter=4),
    "subtitle": ParagraphStyle("st", parent=base["Normal"], fontName=FONT_REGULAR,
                               fontSize=13, leading=18, textColor=SLATE, alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName=FONT_BOLD,
                         fontSize=16, leading=20, textColor=BLUE, spaceBefore=16, spaceAfter=8),
    "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName=FONT_BOLD,
                         fontSize=12, leading=16, textColor=NAVY, spaceBefore=11, spaceAfter=5),
    "body": ParagraphStyle("b", parent=base["Normal"], fontName=FONT_REGULAR,
                           fontSize=9.5, leading=14, textColor=colors.HexColor("#1e293b"),
                           alignment=TA_JUSTIFY, spaceAfter=5),
    "small": ParagraphStyle("sm", parent=base["Normal"], fontName=FONT_REGULAR,
                            fontSize=8, leading=11, textColor=SLATE),
    "cell": ParagraphStyle("c", parent=base["Normal"], fontName=FONT_REGULAR,
                           fontSize=8.5, leading=11.5, textColor=colors.HexColor("#1e293b")),
    "cellb": ParagraphStyle("cb", parent=base["Normal"], fontName=FONT_BOLD,
                            fontSize=8.5, leading=11.5, textColor=NAVY),
    "th": ParagraphStyle("th", parent=base["Normal"], fontName=FONT_BOLD,
                         fontSize=8.5, leading=11, textColor=colors.white),
    "code": ParagraphStyle("code", parent=base["Normal"], fontName=FONT_MONO,
                           fontSize=8.5, leading=12, textColor=colors.HexColor("#0f172a"),
                           backColor=LIGHT, borderPadding=6, spaceBefore=4, spaceAfter=8),
    "note": ParagraphStyle("note", parent=base["Normal"], fontName=FONT_REGULAR,
                           fontSize=9, leading=13, textColor=colors.HexColor("#1e293b"),
                           backColor=colors.HexColor("#eff6ff"), borderPadding=8,
                           borderColor=BLUE, borderWidth=0, spaceBefore=6, spaceAfter=8),
    "warn": ParagraphStyle("warn", parent=base["Normal"], fontName=FONT_REGULAR,
                           fontSize=9, leading=13, textColor=colors.HexColor("#1e293b"),
                           backColor=colors.HexColor("#fef3c7"), borderPadding=8,
                           spaceBefore=6, spaceAfter=8),
}


def P(text, style="body"):
    return Paragraph(clean(text), S[style])


def code(text):
    return Paragraph(clean(text).replace("\n", "<br/>"), S["code"])


def note(text, kind="note"):
    return Paragraph(clean(text), S[kind])


def bullets(items):
    return ListFlowable(
        [ListItem(P(i), leftIndent=12, value="bulletchar") for i in items],
        bulletType="bullet", bulletFontSize=7, bulletColor=BLUE,
        leftIndent=14, spaceBefore=2, spaceAfter=6,
    )


def table(headers, rows, widths, align_center=()):
    data = [[Paragraph(clean(h), S["th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(clean(str(c)), S["cell"]) for c in row])

    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]
    for col in align_center:
        style.append(("ALIGN", (col, 0), (col, -1), "CENTER"))

    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(style))
    return t


# --------------------------------------------------------------------------- document
class Doc(BaseDocTemplate):
    def __init__(self, path, doc_title):
        super().__init__(path, pagesize=A4,
                         leftMargin=20 * mm, rightMargin=20 * mm,
                         topMargin=22 * mm, bottomMargin=20 * mm,
                         title=doc_title, author=APP_NAME, subject=doc_title)
        self.doc_title = doc_title
        frame = Frame(self.leftMargin, self.bottomMargin,
                      self.width, self.height, id="main")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[frame]),
            PageTemplate(id="body", frames=[frame], onPage=self._decorate),
        ])

    def _decorate(self, canvas, doc):
        canvas.saveState()
        w, h = A4

        canvas.setFillColor(NAVY)
        canvas.rect(0, h - 14 * mm, w, 14 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont(FONT_BOLD, 8.5)
        canvas.drawString(20 * mm, h - 9.2 * mm, clean(APP_NAME))
        canvas.setFont(FONT_REGULAR, 8.5)
        canvas.drawRightString(w - 20 * mm, h - 9.2 * mm, clean(self.doc_title))

        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.4)
        canvas.line(20 * mm, 14 * mm, w - 20 * mm, 14 * mm)
        canvas.setFillColor(SLATE)
        canvas.setFont(FONT_REGULAR, 7.5)
        canvas.drawString(20 * mm, 10 * mm, clean("Version %s - %s" % (VERSION, TODAY)))
        canvas.drawRightString(w - 20 * mm, 10 * mm, "Page %d" % doc.page)
        canvas.restoreState()


def cover(title, subtitle, tagline, items):
    story = [Spacer(1, 42 * mm)]

    band = Table([[Paragraph(clean(title.upper()),
                             ParagraphStyle("ct", fontName=FONT_BOLD, fontSize=22,
                                            leading=27, textColor=colors.white,
                                            alignment=TA_CENTER))]],
                 colWidths=[170 * mm])
    band.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 18),
    ]))
    story += [band, Spacer(1, 6 * mm), P(subtitle, "subtitle"), Spacer(1, 3 * mm)]

    rule = Table([[""]], colWidths=[40 * mm], rowHeights=[2])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BLUE)]))
    story += [rule, Spacer(1, 10 * mm),
              Paragraph(clean(tagline), ParagraphStyle(
                  "tag", fontName=FONT_ITALIC, fontSize=10.5, leading=16,
                  textColor=SLATE, alignment=TA_CENTER)),
              Spacer(1, 16 * mm)]

    story.append(table(["Ce document couvre"], [[i] for i in items], [170 * mm]))
    story += [Spacer(1, 18 * mm),
              Paragraph(clean("Version %s  -  %s" % (VERSION, TODAY)),
                        ParagraphStyle("d", fontName=FONT_BOLD, fontSize=9.5,
                                       textColor=SLATE, alignment=TA_CENTER))]
    return story


def build(path, doc_title, story):
    doc = Doc(path, doc_title)
    story = story[:]
    story.insert(0, Spacer(0, 0))
    doc.build(story)
    print("  -", os.path.basename(path))


def next_page_body():
    """Bascule de la page de garde vers le gabarit avec en-tete et pied."""
    from reportlab.platypus import NextPageTemplate
    return [NextPageTemplate("body"), PageBreak()]
