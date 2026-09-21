#!/usr/bin/env node
/**
 * Construit la présentation client (.pptx).
 *
 * Toutes les illustrations sont des captures de l'application réellement
 * lancée, prises sur une base de démonstration alimentée par les vrais
 * traitements : aucune maquette.
 *
 * Le fichier est ensuite post-traité (voir `mode-video.js`) pour enchaîner
 * les diapositives automatiquement, façon vidéo.
 *
 * Usage :  node presentation/build-presentation.js
 */
const path = require('path');
const fs = require('fs');

const PptxGenJS = require(process.env.GV_PPTX || 'pptxgenjs');

const HERE = __dirname;
const IMG = path.join(HERE, 'captures');
const OUT = path.join(HERE, 'Gestion-POS-Presentation.pptx');

// ── Palette : reprise de l'application elle-même (ardoise profonde, bleu, émeraude)
const C = {
  bg: '0B1220',        // fond principal, comme l'écran de caisse
  surface: '18233A',   // cartes
  surfaceAlt: '223052',
  line: '32415F',
  text: 'F1F5F9',
  muted: '94A3B8',
  blue: '3B82F6',
  emerald: '10B981',
  amber: 'F59E0B',
  rose: 'F43F5E',
  white: 'FFFFFF'
};

const FONT = 'Calibri';
const W = 13.333;
const H = 7.5;

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE';
// Les métadonnées partent telles quelles dans docProps/app.xml, que pptxgenjs
// n'échappe pas : une esperluette y casserait le XML. On l'écrit en toutes lettres.
pres.author = 'Gestion Pieces Cycles et Motos';
pres.company = 'Gestion Pieces Cycles et Motos';
pres.title = 'Gestion Pieces Cycles et Motos - Presentation';
pres.subject = 'Logiciel de caisse et de gestion commerciale';

/** Diapositive sombre, fond uni : la base de tout le jeu. */
function slide(notes) {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  if (notes) s.addNotes(notes);
  return s;
}

/** Pastille ronde colorée : motif répété sur toutes les diapositives. */
function pastille(s, { x, y, d = 0.62, fill, label, labelColor }) {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d,
    fill: { color: fill },
    line: { color: fill, width: 0 }
  });
  s.addText(label, {
    x, y, w: d, h: d,
    isTextBox: true, margin: 0, valign: 'top',
    align: 'center', valign: 'middle',
    fontFace: FONT, fontSize: 15, bold: true,
    color: labelColor || C.bg
  });
}

/** Titre de section, aligné à gauche, avec sa pastille. */
function titre(s, { eyebrow, texte, y = 0.55, couleur = C.blue, icone = '' }) {
  if (icone) pastille(s, { x: 0.75, y: y - 0.02, fill: couleur, label: icone });
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: icone ? 1.55 : 0.75, y: y - 0.04, w: 10, h: 0.3,
      isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 12, bold: true, charSpacing: 2, color: couleur
    });
  }
  s.addText(texte, {
    x: icone ? 1.55 : 0.75, y: eyebrow ? y + 0.3 : y, w: 11.2, h: 0.72,
    isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 34, bold: true, color: C.text
  });
}

/** Capture d'écran encadrée : cadre arrondi + ombre portée, motif constant. */
function capture(s, fichier, { x, y, w }) {
  const src = path.join(IMG, fichier);
  if (!fs.existsSync(src)) throw new Error('Capture manquante : ' + src);
  const h = w * (705 / 1366);
  s.addShape(pres.ShapeType.roundRect, {
    x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12,
    rectRadius: 0.04,
    fill: { color: C.surfaceAlt },
    line: { color: C.line, width: 1 },
    shadow: { type: 'outer', color: '000000', blur: 18, offset: 5, angle: 90, opacity: 0.55 }
  });
  s.addImage({ path: src, x, y, w, h });
  return h;
}

/** Carte de contenu, sans filet décoratif (juste un fond légèrement plus clair). */
function carte(s, { x, y, w, h, fill = C.surface }) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: fill },
    line: { color: C.line, width: 1 }
  });
}

/** Chiffre mis en avant. */
function stat(s, { x, y, w, valeur, libelle, couleur = C.emerald, taille = 44 }) {
  s.addText(valeur, {
    x, y, w, h: 0.8, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: taille, bold: true, color: couleur, align: 'left'
  });
  s.addText(libelle, {
    x, y: y + 0.78, w, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 12, color: C.muted, align: 'left'
  });
}

/* ═══════════════════════════ 1 — Ouverture ═══════════════════════════ */
{
  const s = slide(
    "Diapositive d'ouverture. Laisser 3 secondes avant d'enchaîner. " +
    "Le sous-titre annonce la promesse : savoir, chaque soir, ce que le magasin a gagné."
  );

  s.addShape(pres.ShapeType.ellipse, {
    x: 8.6, y: -1.6, w: 7.2, h: 7.2,
    fill: { color: C.blue, transparency: 88 }, line: { type: 'none' }
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.3, y: 3.6, w: 5.2, h: 5.2,
    fill: { color: C.emerald, transparency: 90 }, line: { type: 'none' }
  });

  pastille(s, { x: 0.9, y: 1.5, d: 0.8, fill: C.blue, label: '●', labelColor: C.white });
  s.addText('GESTION PIÈCES CYCLES & MOTOS', {
    x: 1.95, y: 1.6, w: 9, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 14, bold: true, charSpacing: 3, color: C.blue
  });

  s.addText('Le magasin,\nsous contrôle.', {
    x: 0.9, y: 2.35, w: 8.6, h: 2.1, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 60, bold: true, color: C.text, lineSpacing: 62
  });

  s.addText(
    "Logiciel de caisse et de gestion commerciale pour magasins de pièces détachées cycles et motos.",
    {
      x: 0.95, y: 4.55, w: 8.2, h: 0.9, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 17, color: C.muted, lineSpacing: 26
    }
  );

  [['Hors ligne', C.emerald], ['Version 2.0', C.blue], ['Windows 10 / 11', C.amber]].forEach(
    ([t, col], i) => {
      s.addShape(pres.ShapeType.roundRect, {
        x: 0.9 + i * 2.35, y: 5.75, w: 2.1, h: 0.5, rectRadius: 0.25,
        fill: { color: C.surface }, line: { color: col, width: 1 }
      });
      s.addText(t, {
        x: 0.9 + i * 2.35, y: 5.75, w: 2.1, h: 0.5, isTextBox: true, margin: 0, valign: 'top',
        align: 'center', valign: 'middle', fontFace: FONT, fontSize: 12, bold: true, color: col
      });
    }
  );
}

/* ═══════════════════════════ 2 — Accroche ═══════════════════════════ */
{
  const s = slide(
    "L'accroche. Poser la question que le gérant se pose tous les soirs. " +
    "Ne pas répondre tout de suite : la réponse arrive après le problème."
  );
  titre(s, { eyebrow: 'Le soir, à la fermeture', texte: 'Une seule question compte.', icone: '?', couleur: C.amber });

  s.addText(
    '« J\'ai vendu toute la journée.\nMais est-ce que j\'ai gagné de l\'argent ? »',
    {
      x: 1.1, y: 2.65, w: 11, h: 1.9, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 40, bold: true, italic: true, color: C.text, lineSpacing: 52
    }
  );

  s.addText(
    "Sans réponse chiffrée, on pilote au ressenti : on croit gagner sur une pièce qui coûte désormais plus cher, " +
    "on croit avoir du stock qui n'existe plus, et on découvre le résultat trop tard.",
    {
      x: 1.1, y: 5.0, w: 10.4, h: 1.2, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 16, color: C.muted, lineSpacing: 26
    }
  );
}

/* ═══════════════════════════ 3 — Le problème ═══════════════════════════ */
{
  const s = slide(
    "Quatre problèmes concrets du magasin de pièces. Ce sont eux que le logiciel adresse, " +
    "un par un, dans la suite de la présentation."
  );
  titre(s, { eyebrow: 'Le problème', texte: 'Quatre pièges qui faussent le résultat.', icone: '!', couleur: C.rose });

  const items = [
    ['Le prix d\'achat bouge', 'Chaque arrivage arrive à un prix différent. Lequel retenir pour calculer la marge ?', C.amber],
    ['Le stock ne colle plus', 'Ventes, retours, transferts, casse : l\'écart se creuse sans qu\'on sache quand.', C.blue],
    ['Tout le monde voit tout', 'Le vendeur connaît vos prix d\'achat et vos marges. Rien ne les sépare de lui.', C.rose],
    ['Aucune trace', 'Un stock a changé, un prix aussi. Qui, quand, pourquoi ? Personne ne peut le dire.', C.emerald]
  ];

  items.forEach(([t, d, col], i) => {
    const x = 0.85 + (i % 2) * 6.05;
    const y = 2.05 + Math.floor(i / 2) * 2.3;
    carte(s, { x, y, w: 5.7, h: 2.0 });
    pastille(s, { x: x + 0.32, y: y + 0.42, d: 0.55, fill: col, label: String(i + 1) });
    s.addText(t, {
      x: x + 1.05, y: y + 0.39, w: 4.4, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 17, bold: true, color: C.text
    });
    s.addText(d, {
      x: x + 1.05, y: y + 0.88, w: 4.4, h: 0.95, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13.5, color: C.muted, lineSpacing: 20
    });
  });
}

/* ═══════════════════════════ 4 — L'idée ═══════════════════════════ */
{
  const s = slide(
    "Le cœur du raisonnement : le bénéfice se calcule avec le prix payé le jour de l'achat, " +
    "pas avec le prix du jour. C'est ce qui rend les chiffres stables."
  );
  titre(s, { eyebrow: "L'idée", texte: 'Un bénéfice juste se fige au moment de la vente.', icone: '◆', couleur: C.emerald });

  carte(s, { x: 0.85, y: 2.05, w: 5.7, h: 3.3, fill: '2A1520' });
  s.addText('SANS CETTE RÈGLE', {
    x: 1.25, y: 2.4, w: 4.9, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 12, bold: true, charSpacing: 2, color: C.rose
  });
  s.addText(
    [
      { text: 'Vous achetez à 750 DA, vous vendez à 1 400 DA.', options: { breakLine: true } },
      { text: 'Deux mois après, le fournisseur passe à 920 DA.', options: { breakLine: true } },
      { text: 'Le logiciel recalcule tout avec 920 DA.', options: { breakLine: true } },
      { text: 'La marge de la vente passée change toute seule.', options: { bold: true, color: C.rose } }
    ],
    {
      x: 1.25, y: 2.95, w: 4.9, h: 2.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 16.5, color: C.text, lineSpacing: 34
    }
  );

  carte(s, { x: 6.95, y: 2.05, w: 5.6, h: 3.3, fill: '0F2A22' });
  s.addText('AVEC CETTE RÈGLE', {
    x: 7.35, y: 2.4, w: 4.8, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 12, bold: true, charSpacing: 2, color: C.emerald
  });
  s.addText(
    [
      { text: 'Le coût est inscrit sur la ligne de vente : 750 DA.', options: { breakLine: true } },
      { text: 'Le prix d\'achat peut changer cent fois ensuite.', options: { breakLine: true } },
      { text: 'La vente de ce jour-là garde sa marge de 650 DA.', options: { breakLine: true } },
      { text: 'Le résultat d\'hier ne bouge plus jamais.', options: { bold: true, color: C.emerald } }
    ],
    {
      x: 7.35, y: 2.95, w: 4.8, h: 2.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 16.5, color: C.text, lineSpacing: 34
    }
  );

  s.addText('Et pour le prix d\'achat lui-même ? Une règle simple, page suivante.', {
    x: 0.85, y: 5.65, w: 11.6, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 14, italic: true, color: C.muted
  });
}

/* ═══════════════════════════ 5 — La règle ═══════════════════════════ */
{
  const s = slide(
    "La règle du prix d'achat, telle qu'elle a été demandée par le gérant. " +
    "Le seuil de 5 est modifiable dans les paramètres."
  );
  titre(s, { eyebrow: 'La règle du prix d\'achat', texte: 'À chaque arrivage, deux cas. Pas trois.', icone: '%', couleur: C.amber });

  carte(s, { x: 0.85, y: 2.05, w: 5.7, h: 2.75, fill: '2A2010' });
  s.addText('STOCK RESTANT < 5', {
    x: 1.25, y: 2.35, w: 4.9, h: 0.35, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 13, bold: true, charSpacing: 2, color: C.amber
  });
  s.addText('Le nouveau prix devient dominant', {
    x: 1.25, y: 2.78, w: 4.9, h: 0.5, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 20, bold: true, color: C.text
  });
  s.addText(
    "Il ne reste presque plus de marchandise achetée à l'ancien prix : celui-ci ne doit plus peser dans le calcul.",
    {
      x: 1.25, y: 3.4, w: 4.9, h: 1.4, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 15, color: C.muted, lineSpacing: 26
    }
  );

  carte(s, { x: 6.95, y: 2.05, w: 5.6, h: 2.75, fill: '11213D' });
  s.addText('STOCK RESTANT ≥ 5', {
    x: 7.35, y: 2.35, w: 4.8, h: 0.35, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 13, bold: true, charSpacing: 2, color: C.blue
  });
  s.addText('Médiane des deux prix', {
    x: 7.35, y: 2.78, w: 4.8, h: 0.5, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 20, bold: true, color: C.text
  });
  s.addText(
    "(ancien prix + nouveau prix) ÷ 2. Le stock ancien compte encore, le coût moyen suit la réalité du magasin.",
    {
      x: 7.35, y: 3.4, w: 4.8, h: 1.4, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 15, color: C.muted, lineSpacing: 26
    }
  );

  s.addText(
    "Le seuil de 5 unités se règle dans les paramètres. La règle s'applique ligne par ligne, à chaque bon d'achat.",
    {
      x: 0.85, y: 5.15, w: 11.7, h: 0.5, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 14, italic: true, color: C.muted
    }
  );
  s.addText('→ Et voici la règle appliquée, dans le logiciel, sur un vrai arrivage.', {
    x: 0.85, y: 5.75, w: 11.7, h: 0.5, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 15, bold: true, color: C.emerald
  });
}

/* ═══════════════════════════ 6 — Preuve : la règle appliquée ═══════════════════════════ */
{
  const s = slide(
    "Capture réelle du journal d'audit après un bon d'achat de trois lignes. " +
    "Les deux branches de la règle apparaissent : deux médianes, et un prix dominant sur l'article dont il ne restait que 3 unités."
  );
  titre(s, { eyebrow: 'Dans le logiciel', texte: 'Un arrivage, trois lignes, la règle visible.', icone: '▣', couleur: C.emerald, y: 0.45 });

  capture(s, 'app-regle.png', { x: 0.75, y: 1.75, w: 8.4 });

  const points = [
    ['ART-00003', 'stock 25 → médiane', '1 200 → 1 290 DA', C.blue],
    ['ART-00001', 'stock 45 → médiane', '750 → 835 DA', C.blue],
    ['ART-00016', 'stock 3 → dominant', '350 → 52 DA', C.amber]
  ];
  points.forEach(([ref, regle, valeur, col], i) => {
    const y = 2.05 + i * 1.28;
    carte(s, { x: 9.5, y, w: 3.1, h: 1.08 });
    s.addText(ref, {
      x: 9.75, y: y + 0.12, w: 2.7, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13, bold: true, color: col
    });
    s.addText(regle, {
      x: 9.75, y: y + 0.42, w: 2.7, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 11.5, color: C.muted
    });
    s.addText(valeur, {
      x: 9.75, y: y + 0.7, w: 2.7, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 12.5, bold: true, color: C.text
    });
  });

  s.addText("Chaque recalcul est écrit au journal, avec le stock qui l'a déclenché.", {
    x: 0.75, y: 6.5, w: 11.8, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 13.5, italic: true, color: C.muted
  });
}

/* ═══════════════════════════ 7 — La caisse ═══════════════════════════ */
{
  const s = slide(
    "L'écran de caisse en fonctionnement, avec un panier de deux articles. " +
    "Les indicateurs du jour restent visibles pendant la vente."
  );
  titre(s, { eyebrow: 'La solution — jour après jour', texte: 'Encaisser sans quitter l\'écran.', icone: '▶', couleur: C.blue, y: 0.45 });

  capture(s, 'app-caisse.png', { x: 0.75, y: 1.75, w: 8.4 });

  const pts = [
    ['Douchette ou recherche', 'Code-barres, référence, marque ou modèle de moto.'],
    ['Trois tarifs', 'Détail, semi-gros, gros — un clic par ligne.'],
    ['Stock vérifié', 'Une vente au-delà du stock est refusée.'],
    ['Indicateurs du jour', 'Chiffre d\'affaires, bénéfice, dettes clients.']
  ];
  pts.forEach(([t, d], i) => {
    const y = 1.95 + i * 1.18;
    pastille(s, { x: 9.5, y, d: 0.42, fill: C.blue, label: '•', labelColor: C.white });
    s.addText(t, {
      x: 10.05, y: y - 0.02, w: 2.6, h: 0.32, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13.5, bold: true, color: C.text
    });
    s.addText(d, {
      x: 10.05, y: y + 0.3, w: 2.6, h: 0.75, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 11.5, color: C.muted, lineSpacing: 16
    });
  });
}

/* ═══════════════════════════ 8 — Stock ═══════════════════════════ */
{
  const s = slide(
    "Le stock bouge dans un seul sens à la fois, et chaque mouvement porte un code. " +
    "Capture réelle de l'écran Stock."
  );
  titre(s, { eyebrow: 'La solution — le stock', texte: 'Chaque mouvement porte un code.', icone: '≡', couleur: C.emerald, y: 0.45 });

  capture(s, 'app-stock.png', { x: 0.75, y: 2.35, w: 7.9 });

  const codes = [
    ['90', 'Achat', 'Stock +', C.emerald],
    ['91', 'Vente', 'Stock −', C.rose],
    ['92', 'Retour client', 'Stock +', C.emerald],
    ['93', 'Ajustement', 'Motif obligatoire', C.amber],
    ['94 / 95', 'Transfert', 'Entre boutiques', C.blue]
  ];
  codes.forEach(([c, t, e, col], i) => {
    const y = 2.4 + i * 0.86;
    carte(s, { x: 9.0, y, w: 3.6, h: 0.72 });
    s.addText(c, {
      x: 9.2, y: y + 0.16, w: 0.9, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 15, bold: true, color: col
    });
    s.addText(t, {
      x: 10.1, y: y + 0.08, w: 2.3, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 12.5, bold: true, color: C.text
    });
    s.addText(e, {
      x: 10.1, y: y + 0.36, w: 2.3, h: 0.28, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 11, color: C.muted
    });
  });

  s.addText(
    "Vente, achat, retour, ajustement et transfert sont chacun écrits en une seule opération indivisible : " +
    "il ne peut pas rester un stock modifié sans son écriture comptable.",
    {
      x: 0.75, y: 6.45, w: 11.8, h: 0.6, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13, italic: true, color: C.muted, lineSpacing: 19
    }
  );
}

/* ═══════════════════════════ 9 — Rôles ═══════════════════════════ */
{
  const s = slide(
    "Les rôles et la matrice de permissions. Le point important : un caissier ne reçoit jamais " +
    "les prix d'achat, ce n'est pas qu'un masquage d'affichage."
  );
  titre(s, { eyebrow: 'La solution — qui voit quoi', texte: 'Le vendeur encaisse. Il ne voit pas vos marges.', icone: '⚿', couleur: C.rose, y: 0.45 });

  capture(s, 'app-permissions.png', { x: 0.75, y: 1.8, w: 8.0 });

  const roles = [
    ['Propriétaire', 'Tout, y compris comptes et journal.', C.amber],
    ['Gérant', 'Sa boutique. Pas les comptes.', C.blue],
    ['Caissier', 'Encaisse. Ni coûts ni marges.', C.emerald],
    ['Auditeur', 'Consultation seule, sans modification.', C.muted]
  ];
  roles.forEach(([t, d, col], i) => {
    const y = 1.95 + i * 1.12;
    carte(s, { x: 9.1, y, w: 3.5, h: 0.95 });
    s.addText(t, {
      x: 9.35, y: y + 0.13, w: 3, h: 0.3, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 14, bold: true, color: col
    });
    s.addText(d, {
      x: 9.35, y: y + 0.44, w: 3, h: 0.45, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 11.5, color: C.muted, lineSpacing: 15
    });
  });

  s.addText(
    "Chaque module se règle séparément : consulter, modifier, ou rien. Les modules interdits n'apparaissent même pas.",
    {
      x: 0.75, y: 6.5, w: 11.8, h: 0.45, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13, italic: true, color: C.muted
    }
  );
}

/* ═══════════════════════════ 10 — Journal ═══════════════════════════ */
{
  const s = slide(
    "Le journal d'audit : capture réelle du détail d'une entrée, avec l'avant/après " +
    "et le contexte technique qui explique la décision du logiciel."
  );
  titre(s, { eyebrow: 'La solution — la preuve', texte: 'Qui a fait quoi, quand, et avec quelles valeurs.', icone: '✓', couleur: C.blue, y: 0.45 });

  capture(s, 'app-journal-detail.png', { x: 2.35, y: 1.75, w: 8.6 });

  s.addText(
    "Registre en ajout seul : aucune opération de l'application ne le modifie ni ne l'efface. " +
    "Connexions et échecs, ventes, retours, achats, recalculs de prix, ajustements de stock, changements de droits — " +
    "et jusqu'aux accès refusés.",
    {
      x: 1.6, y: 6.25, w: 10.1, h: 0.85, isTextBox: true, margin: 0, valign: 'top',
      align: 'center', fontFace: FONT, fontSize: 13.5, color: C.muted, lineSpacing: 20
    }
  );
}

/* ═══════════════════════════ 11 — Rapports ═══════════════════════════ */
{
  const s = slide(
    "Les rapports : la réponse à la question posée en ouverture. " +
    "Chiffres réels de la base de démonstration."
  );
  titre(s, { eyebrow: 'La solution — la réponse', texte: 'Le soir, le chiffre est là.', icone: '↑', couleur: C.emerald, y: 0.45 });

  capture(s, 'app-rapports.png', { x: 0.75, y: 1.8, w: 8.3 });

  const chiffres = [
    ['30 050 DA', 'Chiffre d\'affaires', C.blue],
    ['5 200 DA', 'Dépenses & charges', C.rose],
    ['7 899 DA', 'Bénéfice net réel', C.emerald]
  ];
  chiffres.forEach(([v, l, col], i) => {
    const y = 2.0 + i * 1.5;
    carte(s, { x: 9.4, y, w: 3.2, h: 1.28 });
    stat(s, { x: 9.65, y: y + 0.12, w: 2.8, valeur: v, libelle: l, couleur: col, taille: 26 });
  });

  s.addText(
    "Bénéfice brut = (prix de vente − coût figé) × quantité, moins la marge annulée par les retours. " +
    "Bénéfice net = bénéfice brut − dépenses. Une perte s'affiche comme une perte : rien n'est ramené à zéro.",
    {
      x: 0.75, y: 6.45, w: 11.8, h: 0.65, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13, italic: true, color: C.muted, lineSpacing: 19
    }
  );
}

/* ═══════════════════════════ 12 — Les autres écrans ═══════════════════════════ */
{
  const s = slide(
    "Vue d'ensemble : les autres modules, en quatre captures réelles. " +
    "Passer vite, c'est une respiration avant la conclusion."
  );
  titre(s, { eyebrow: 'Le reste du magasin', texte: 'Douze modules, une seule barre d\'onglets.', icone: '⊞', couleur: C.blue, y: 0.45 });

  const vignettes = [
    ['app-produits.png', 'Catalogue', 'Prix, emplacements, codes-barres, photos, compatibilités motos.'],
    ['app-clients.png', 'Clients & crédits', 'Plafond de crédit, dettes, versements.'],
    ['app-depenses.png', 'Dépenses', 'Charges du magasin, catégories modifiables.'],
    ['app-utilisateurs.png', 'Utilisateurs', 'Comptes, rôles, verrouillages, réinitialisations.']
  ];
  vignettes.forEach(([f, t, d], i) => {
    const x = 0.75 + (i % 2) * 6.2;
    const y = 1.95 + Math.floor(i / 2) * 2.55;
    capture(s, f, { x, y, w: 3.9 });
    s.addText(t, {
      x: x + 4.15, y: y + 0.42, w: 1.95, h: 0.32, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 14, bold: true, color: C.text
    });
    s.addText(d, {
      x: x + 4.15, y: y + 0.8, w: 1.95, h: 1.2, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 11, color: C.muted, lineSpacing: 15
    });
  });
}

/* ═══════════════════════════ 13 — Hors ligne & portail ═══════════════════════════ */
{
  const s = slide(
    "Deux garanties d'exploitation : la caisse ne dépend pas d'internet, " +
    "et le propriétaire peut tout consulter à distance quand la connexion revient."
  );
  titre(s, { eyebrow: 'Exploitation', texte: 'La coupure d\'internet n\'arrête pas la vente.', icone: '◉', couleur: C.amber });

  carte(s, { x: 0.85, y: 2.1, w: 5.7, h: 3.35 });
  pastille(s, { x: 1.2, y: 2.45, d: 0.6, fill: C.emerald, label: '1' });
  s.addText('Tout est sur le poste', {
    x: 2.0, y: 2.47, w: 4.3, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 18, bold: true, color: C.text
  });
  s.addText(
    [
      { text: 'La base du magasin tient dans un seul fichier, sur la caisse.', options: { breakLine: true } },
      { text: 'Aucune dépendance à internet pour vendre.', options: { breakLine: true } },
      { text: 'Une sauvegarde = une copie de ce fichier sur une clé USB.', options: {} }
    ],
    {
      x: 1.25, y: 3.25, w: 4.9, h: 2.2, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 15, color: C.muted, lineSpacing: 28
    }
  );

  carte(s, { x: 6.95, y: 2.1, w: 5.6, h: 3.35 });
  pastille(s, { x: 7.3, y: 2.45, d: 0.6, fill: C.blue, label: '2' });
  s.addText('Le portail du propriétaire', {
    x: 8.1, y: 2.47, w: 4.3, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 18, bold: true, color: C.text
  });
  s.addText(
    [
      { text: 'Quand la connexion revient, la caisse envoie son activité.', options: { breakLine: true } },
      { text: 'Ventes, achats, retours, stock, dépenses et journal complet.', options: { breakLine: true } },
      { text: 'Consultable à distance, boutique par boutique.', options: {} }
    ],
    {
      x: 7.35, y: 3.25, w: 4.8, h: 2.2, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 15, color: C.muted, lineSpacing: 28
    }
  );

  s.addText(
    "Chaque caisse s'authentifie auprès du serveur par une clé. Un envoi rejoué ne crée jamais de doublon.",
    {
      x: 0.85, y: 5.75, w: 11.7, h: 0.45, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13.5, italic: true, color: C.muted
    }
  );
}

/* ═══════════════════════════ 14 — Vérifications ═══════════════════════════ */
{
  const s = slide(
    "La preuve de sérieux : des vérifications automatisées rejouables, " +
    "qui portent sur les calculs d'argent et sur la reprise d'une base existante."
  );
  titre(s, { eyebrow: 'Ce qui est vérifié', texte: '108 contrôles automatisés, rejouables.', icone: '✔', couleur: C.emerald });

  const blocs = [
    ['54', 'Règles métier', 'Les deux branches du prix d\'achat, entrées et sorties de stock, refus de survente, retours partiels puis totaux, écriture du journal, cloisonnement du caissier.', C.emerald],
    ['27', 'Reprise de base', 'Ouverture d\'une base existante : aucune perte de donnée, nouvelles tables créées, permissions complétées, opération rejouable.', C.blue],
    ['26', 'Chaîne serveur', 'Authentification du portail, envoi refusé sans clé, absence de doublon au renvoi, lecture du journal, accès refusé au caissier.', C.amber]
  ];
  blocs.forEach(([n, t, d, col], i) => {
    const x = 0.85 + i * 3.95;
    carte(s, { x, y: 2.05, w: 3.7, h: 3.65 });
    s.addText(n, {
      x: x + 0.3, y: 2.3, w: 3.1, h: 0.9, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 46, bold: true, color: col
    });
    s.addText(t, {
      x: x + 0.3, y: 3.25, w: 3.1, h: 0.35, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 15, bold: true, color: C.text
    });
    s.addText(d, {
      x: x + 0.3, y: 3.7, w: 3.1, h: 1.9, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13, color: C.muted, lineSpacing: 20
    });
  });

  s.addText(
    "Ces contrôles s'exécutent sur une vraie base de données, à travers les traitements réels de l'application — " +
    "pas sur des imitations.",
    {
      x: 0.85, y: 6.0, w: 11.7, h: 0.5, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 13.5, italic: true, color: C.muted
    }
  );
}

/* ═══════════════════════════ 15 — Ce qui est livré ═══════════════════════════ */
{
  const s = slide(
    "Le contenu de la livraison. Terminer sur du concret : ce que le client reçoit, aujourd'hui."
  );
  titre(s, { eyebrow: 'La livraison', texte: 'Ce que vous recevez.', icone: '▣', couleur: C.blue });

  const livrables = [
    ['Installateur Windows', 'Gestion-POS-Setup-2.0.0.exe — raccourci bureau et menu Démarrer.', C.blue],
    ['Version portable', 'Se lance depuis une clé USB, sans installation.', C.emerald],
    ['Guide d\'installation', 'Comptes, droits, imprimante, règles de stock, sauvegarde.', C.amber],
    ['Guide de tests & dépannage', 'Recette en 14 points et résolution des incidents courants.', C.rose],
    ['Empreintes SHA-256', 'Pour vérifier que les fichiers reçus sont intacts.', C.muted]
  ];
  livrables.forEach(([t, d, col], i) => {
    const y = 2.15 + i * 0.93;
    carte(s, { x: 0.85, y, w: 11.65, h: 0.8 });
    pastille(s, { x: 1.1, y: y + 0.12, d: 0.55, fill: col, label: '▸' });
    s.addText(t, {
      x: 1.85, y: y + 0.12, w: 3.6, h: 0.32, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 14, bold: true, color: C.text
    });
    s.addText(d, {
      x: 5.5, y: y + 0.14, w: 6.8, h: 0.55, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 12.5, color: C.muted
    });
  });

  s.addText('Windows 10 / 11 64 bits · 4 Go de mémoire · 500 Mo d\'espace disque', {
    x: 0.85, y: 6.85, w: 11.65, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 12.5, italic: true, color: C.muted
  });
}

/* ═══════════════════════════ 16 — Conclusion ═══════════════════════════ */
{
  const s = slide(
    "Conclusion : revenir à la question d'ouverture et y répondre. " +
    "Laisser cette diapositive à l'écran plus longtemps."
  );

  s.addShape(pres.ShapeType.ellipse, {
    x: -1.8, y: 3.4, w: 6.4, h: 6.4,
    fill: { color: C.emerald, transparency: 90 }, line: { type: 'none' }
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 9.4, y: -2.0, w: 6.6, h: 6.6,
    fill: { color: C.blue, transparency: 89 }, line: { type: 'none' }
  });

  s.addText('LA RÉPONSE', {
    x: 1.1, y: 1.85, w: 8, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 14, bold: true, charSpacing: 3, color: C.emerald
  });
  s.addText('« Oui. Et je sais exactement\ncombien, et pourquoi. »', {
    x: 1.1, y: 2.35, w: 10.8, h: 1.9, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 46, bold: true, color: C.text, lineSpacing: 56
  });

  const promesses = [
    ['Des chiffres qui ne bougent plus', C.emerald],
    ['Un stock qui suit la réalité', C.blue],
    ['Chaque geste tracé, nominativement', C.amber]
  ];
  promesses.forEach(([t, col], i) => {
    const y = 4.55 + i * 0.62;
    pastille(s, { x: 1.15, y, d: 0.44, fill: col, label: '✓' });
    s.addText(t, {
      x: 1.8, y: y + 0.02, w: 9, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
      fontFace: FONT, fontSize: 17, color: C.text
    });
  });

  s.addText('Gestion Pièces Cycles & Motos — version 2.0', {
    x: 1.1, y: 6.65, w: 10.8, h: 0.4, isTextBox: true, margin: 0, valign: 'top',
    fontFace: FONT, fontSize: 13, color: C.muted
  });
}

pres.writeFile({ fileName: OUT }).then(() => {
  console.log('Présentation écrite : ' + OUT);
});
