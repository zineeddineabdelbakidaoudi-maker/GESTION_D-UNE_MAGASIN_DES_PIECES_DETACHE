#!/usr/bin/env node
/**
 * Transforme la présentation en diaporama qui se déroule seul, façon vidéo.
 *
 * pptxgenjs n'expose ni les transitions ni les animations : on les écrit
 * directement dans le XML du paquet .pptx, qui est une archive ZIP.
 *
 * Sur chaque diapositive :
 *   - une transition (fondu, ou balayage sur les diapositives de respiration) ;
 *   - un délai d'avance automatique proportionnel à la densité du texte ;
 *   - une animation d'entrée en fondu sur le corps de la diapositive.
 *
 * Sur la présentation :
 *   - lecture en boucle, minutages activés.
 *
 * Usage :  node presentation/mode-video.js [fichier.pptx]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const FICHIER = process.argv[2] || path.join(__dirname, 'Gestion-POS-Presentation.pptx');

// Durée d'affichage de chaque diapositive, en secondes.
// L'ouverture et la conclusion respirent ; les diapositives denses durent plus.
const DUREES = [6, 7, 11, 11, 11, 10, 9, 10, 9, 9, 9, 9, 9, 9, 9, 9];

// Transition par diapositive : `fade` par défaut, `push` pour marquer une rupture.
const RUPTURES = new Set([2, 6, 15]); // problème, première preuve, conclusion

const ns = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main'
};

/**
 * Bloc d'animation : fondu d'entrée sur toutes les formes de la diapositive,
 * déclenché automatiquement à l'affichage.
 */
function timingXml(shapeIds) {
  if (!shapeIds.length) return '';
  const effets = shapeIds
    .map(
      (id, i) => `<p:par><p:cTn id="${10 + i * 2}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="${i === 0 ? 'afterEffect' : 'withEffect'}"><p:stCondLst><p:cond delay="${i * 120}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${11 + i * 2}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn dur="500"/><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`
    )
    .join('');

  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effets}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

function main() {
  if (!fs.existsSync(FICHIER)) {
    console.error('Fichier introuvable : ' + FICHIER);
    process.exit(1);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-video-'));

  // Décompression via PowerShell (présent sur Windows) ou unzip.
  try {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${FICHIER}' -DestinationPath '${tmp}' -Force`
    ], { stdio: 'pipe' });
  } catch {
    execFileSync('unzip', ['-q', FICHIER, '-d', tmp], { stdio: 'pipe' });
  }

  const dossierSlides = path.join(tmp, 'ppt', 'slides');
  const fichiers = fs
    .readdirSync(dossierSlides)
    .filter(f => /^slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

  fichiers.forEach((nom, index) => {
    const chemin = path.join(dossierSlides, nom);
    let xml = fs.readFileSync(chemin, 'utf8');

    if (xml.includes('<p:transition')) return; // déjà traité

    const secondes = DUREES[index] || 9;
    const type = RUPTURES.has(index)
      ? '<p:push dir="l"/>'
      : '<p:fade/>';

    // Identifiants des formes, pour l'animation d'entrée.
    const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)]
      .map(m => parseInt(m[1], 10))
      .filter(id => id > 1);

    const bloc =
      `<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" ` +
      `spd="slow" p14:dur="900" advTm="${secondes * 1000}">${type}</p:transition>` +
      timingXml(ids.slice(0, 14));

    xml = xml.replace('</p:sld>', bloc + '</p:sld>');
    fs.writeFileSync(chemin, xml, 'utf8');
  });

  // Lecture en boucle, en utilisant les minutages enregistrés.
  // `showPr` appartient à presProps.xml, pas à presentation.xml : placé dans ce
  // dernier, PowerPoint rejette le fichier (l'élément n'y est pas attendu).
  const propsPath = path.join(tmp, 'ppt', 'presProps.xml');
  let propsXml = fs.readFileSync(propsPath, 'utf8');
  if (!propsXml.includes('<p:showPr')) {
    const showPr =
      '<p:showPr loop="1" showNarration="1"><p:present/><p:sldAll/>' +
      '<p:penClr><a:prstClr val="red"/></p:penClr></p:showPr>';
    propsXml = propsXml.includes('</p:presentationPr>')
      ? propsXml.replace('</p:presentationPr>', showPr + '</p:presentationPr>')
      : propsXml.replace(/<p:presentationPr([^>]*)\/>/, '<p:presentationPr$1>' + showPr + '</p:presentationPr>');
    fs.writeFileSync(propsPath, propsXml, 'utf8');
  }

  // Recompression : le .pptx doit contenir les fichiers à la racine de l'archive.
  const sortie = FICHIER;
  fs.rmSync(sortie, { force: true });
  try {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path '${tmp}\\*' -DestinationPath '${sortie}.zip' -Force; ` +
      `Move-Item -LiteralPath '${sortie}.zip' -Destination '${sortie}' -Force`
    ], { stdio: 'pipe' });
  } catch {
    execFileSync('zip', ['-Xqr', sortie, '.'], { cwd: tmp, stdio: 'pipe' });
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const total = DUREES.slice(0, fichiers.length).reduce((a, b) => a + b, 0);
  console.log(
    `Mode vidéo appliqué à ${fichiers.length} diapositives ` +
    `(défilement automatique, durée totale ~${Math.round(total / 6) / 10} min, lecture en boucle).`
  );
}

main();
