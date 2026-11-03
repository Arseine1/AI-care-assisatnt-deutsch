// Génère les 5 lettres de médecin (PDF) de la boîte KIM simulée, en allemand (courrier réaliste).
// 4 PDF avec texte + 1 PDF « scanné » (image seule, OCR obligatoire).
// Aucun nom réel : médecins et patients sont fictifs.
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { creerScan } from './lib/scan.mjs';
import { LETTRES, LETTRE_SCAN } from '../source/lettres.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'lettres');
mkdirSync(dossier, { recursive: true });

const date = new Date();
const dateCourte = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function ecrireLettre(l) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 64 });
    const sortie = createWriteStream(join(dossier, l.fichier));
    sortie.on('finish', resolve);
    sortie.on('error', reject);
    doc.pipe(sortie);

    doc.font('Helvetica-Bold').fontSize(13).text(l.expediteur.nom);
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(l.expediteur.fonction);
    doc.text('Praxis (Dokument zu Testzwecken – fiktiv)');
    doc.moveDown(1.5).fillColor('#000');
    doc.fontSize(10).text('An: Pflegeheim Haus Sonnenhof (KIM)');
    doc.text(`Datum: ${dateCourte}`);
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(14).text('Arztbrief');
    doc.moveDown(0.5).font('Helvetica').fontSize(11).text(`Patient: ${l.patient}`);
    doc.moveDown(1);
    for (const [titre, texte] of l.corps) {
      doc.font('Helvetica-Bold').fontSize(11).text(`${titre}:`);
      doc.font('Helvetica').text(texte).moveDown(0.8);
    }
    doc.moveDown(1).text('Mit freundlichen Grüßen');
    doc.moveDown(0.5).text(l.expediteur.nom);
    doc.end();
  });
}

async function ecrireScan(l) {
  const lignes = [
    { texte: l.expediteur.nom, taille: 32, gras: true },
    { texte: l.expediteur.fonction, taille: 24 },
    { texte: '', taille: 24 },
    { texte: 'An: Pflegeheim Haus Sonnenhof (KIM)', taille: 26 },
    { texte: `Datum: ${dateCourte}`, taille: 26 },
    { texte: '', taille: 24 },
    { texte: 'Arztbrief', taille: 38, gras: true },
    { texte: `Patient: ${l.patient}`, taille: 28 },
    { texte: '', taille: 24 },
    { texte: 'Diagnose:', taille: 28, gras: true },
    { texte: 'Lumbalgie, chronische Niereninsuffizienz bekannt.', taille: 28 },
    { texte: '', taille: 20 },
    { texte: 'Therapie:', taille: 28, gras: true },
    { texte: 'Ibuprofen 600 mg, 1-1-1, ueber 10 Tage.', taille: 28 },
    { texte: 'Magenschutz mit Pantoprazol 40 mg, 1-0-0.', taille: 28 },
    { texte: '', taille: 20 },
    { texte: 'Kontrolle in 10 Tagen.', taille: 28 },
    { texte: '', taille: 40 },
    { texte: 'Mit freundlichen Gruessen', taille: 28 },
    { texte: l.expediteur.nom, taille: 28 },
    { texte: '', taille: 40 },
    { texte: '(Dokument zu Testzwecken - fiktiv)', taille: 22 },
  ];
  await creerScan(lignes, join(dossier, l.fichier), { graine: 11 });
}

for (const l of LETTRES) await ecrireLettre(l);
await ecrireScan(LETTRE_SCAN);
console.log(`${LETTRES.length + 1} lettres écrites dans data/lettres/.`);
