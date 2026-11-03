// Fabrique un PDF « scanné » : le texte est dessiné dans une IMAGE (aucun texte sélectionnable),
// avec fond légèrement grisé et bruit, pour tester l'OCR (OCRmyPDF, étape 4).
// Pur JavaScript (pas de binaire natif) : pureimage + pdfkit.
import { createWriteStream, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as PImage from 'pureimage';
import PDFDocument from 'pdfkit';

const POLICES = [
  'C:/Windows/Fonts/arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

// Générateur pseudo-aléatoire déterministe : le scan est identique à chaque exécution.
function aleatoire(graine) {
  let s = graine;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export async function creerScan(lignes, cheminPdf, { graine = 7, cheminPng = null } = {}) {
  const chemin = POLICES.find((p) => existsSync(p));
  if (!chemin) throw new Error('Aucune police TrueType trouvée pour dessiner le scan.');
  const police = PImage.registerFont(chemin, 'Scan');
  await police.load();

  // A4 à 150 dpi
  const L = 1240, H = 1754;
  const img = PImage.make(L, H);
  const ctx = img.getContext('2d');
  const rnd = aleatoire(graine);

  ctx.fillStyle = '#f3f0e8';
  ctx.fillRect(0, 0, L, H);
  for (let i = 0; i < 2500; i++) {
    const g = 200 + Math.floor(rnd() * 40);
    ctx.fillStyle = `rgb(${g},${g},${g - 6})`;
    ctx.fillRect(Math.floor(rnd() * L), Math.floor(rnd() * H), 2, 2);
  }

  ctx.fillStyle = '#25252a';
  let y = 150;
  for (const { texte, taille = 30, gras = false } of lignes) {
    ctx.font = `${taille}pt Scan`;
    const dx = Math.floor(rnd() * 3) - 1; // léger décalage de ligne
    const dy = Math.floor(rnd() * 3) - 1;
    ctx.fillText(texte, 110 + dx, y + dy);
    if (gras) ctx.fillText(texte, 111 + dx, y + dy);
    y += taille * 1.9 + (texte === '' ? taille : 0);
  }

  const png = join(tmpdir(), `scan-${process.pid}-${graine}.png`);
  await PImage.encodePNGToStream(img, createWriteStream(png));
  await new Promise((r) => setTimeout(r, 150));

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const sortie = createWriteStream(cheminPdf);
    sortie.on('finish', resolve);
    sortie.on('error', reject);
    doc.pipe(sortie);
    doc.image(readFileSync(png), 0, 0, { width: doc.page.width, height: doc.page.height });
    doc.end();
  });
  if (cheminPng) writeFileSync(cheminPng, readFileSync(png)); // aperçu optionnel pour contrôle visuel
  unlinkSync(png);
}
