# -*- coding: utf-8 -*-
"""
Genere le QR code de telechargement remis au client.

Le code pointe vers le lien « latest » de GitHub : il reste valable pour
toutes les versions publiees ensuite, sans reimprimer l'affiche.

    python scripts/generer_qr.py
"""
import os

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

DEPOT = "zineeddineabdelbakidaoudi-maker/GESTION_D-UNE_MAGASIN_DES_PIECES_DETACHE"
LIEN = f"https://github.com/{DEPOT}/releases/latest/download/Gestion-Pieces-Moto-POS-Portable.exe"

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "livraison", "QR-Telechargement")
os.makedirs(SORTIE, exist_ok=True)


def police(taille, gras=False):
    """Une police systeme qui porte les accents francais."""
    for nom in (("seguisb.ttf", "segoeuib.ttf", "arialbd.ttf") if gras
                else ("segoeui.ttf", "arial.ttf")):
        chemin = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", nom)
        if os.path.exists(chemin):
            return ImageFont.truetype(chemin, taille)
    return ImageFont.load_default()


def centrer(dessin, y, texte, fonte, couleur, largeur):
    l = dessin.textbbox((0, 0), texte, font=fonte)[2]
    dessin.text(((largeur - l) // 2, y), texte, font=fonte, fill=couleur)
    return dessin.textbbox((0, 0), texte, font=fonte)[3]


# Correction d'erreur maximale : le QR reste lisible imprime, plie ou sali.
qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=12, border=2)
qr.add_data(LIEN)
qr.make(fit=True)
image_qr = qr.make_image(fill_color="#0b2d6b", back_color="white").convert("RGB")

# QR seul, pour reutilisation dans un document.
image_qr.save(os.path.join(SORTIE, "QR-seul.png"))

# Affiche A5 prete a imprimer.
L, H = 1000, 1400
affiche = Image.new("RGB", (L, H), "white")
d = ImageDraw.Draw(affiche)

d.rectangle([0, 0, L, 150], fill="#0b2d6b")
centrer(d, 40, "Gestion Pieces Cycles & Motos", police(46, True), "white", L)
centrer(d, 100, "POINT DE VENTE", police(26), "#b8cbe8", L)

centrer(d, 200, "Scannez pour telecharger l'application", police(34, True), "#111827", L)
centrer(d, 250, "Version portable — aucune installation requise", police(24), "#4b5563", L)

cote = 620
qr_redim = image_qr.resize((cote, cote), Image.NEAREST)
x = (L - cote) // 2
affiche.paste(qr_redim, (x, 320))
d.rectangle([x - 8, 312, x + cote + 8, 320 + cote + 8], outline="#0b2d6b", width=4)

y = 320 + cote + 50
centrer(d, y, "Ou saisissez ce lien dans le navigateur :", police(22), "#4b5563", L)
centrer(d, y + 40, "github.com/zineeddineabdelbakidaoudi-maker", police(20, True), "#0b2d6b", L)
centrer(d, y + 70, "→ Releases → derniere version", police(20, True), "#0b2d6b", L)

# Les identifiants ne figurent pas sur l'affiche : elle est faite pour etre
# affichee et photographiee. Ils se transmettent separement, de la main a la main.
d.rectangle([80, y + 130, L - 80, y + 250], outline="#d1d5db", width=2)
d.text((110, y + 155), "Premiere connexion", font=police(22, True), fill="#111827")
d.text((110, y + 195), "Identifiants remis separement par l'installateur.",
       font=police(21), fill="#374151")

centrer(d, H - 60, "Version de demonstration — essai 7 jours", police(18), "#9ca3af", L)

affiche.save(os.path.join(SORTIE, "Affiche-QR-Telechargement.png"))

with open(os.path.join(SORTIE, "lien.txt"), "w", encoding="utf-8") as f:
    f.write(LIEN + "\n")

print("Lien encode :", LIEN)
print("Ecrit dans  :", SORTIE)
for nom in sorted(os.listdir(SORTIE)):
    print("   -", nom)
