// Erzeugt data/fichiers/compte-rendu-scanne.pdf: Visitenbericht des Diabetologen,
// als Bild („Scan“), um die OCR in Schritt 4 zu testen. Fiktive Daten.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerScan } from './lib/scan.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const jour = new Date().toLocaleDateString('de-DE');

await creerScan(
  [
    { texte: 'Haus Sonnenhof - Aerztlicher Visitenbericht', taille: 32, gras: true },
    { texte: `Datum: ${jour}`, taille: 26 },
    { texte: 'Betroffener Bewohner: Herr Karl Becker, Zimmer 14, geb. 27.01.1939', taille: 26 },
    { texte: 'Aerztin: Dr. Elke Brandt, Diabetologin', taille: 26 },
    { texte: '', taille: 24 },
    { texte: 'Anlass: wiederholte naechtliche Hypoglykaemien (3 in 5 Tagen).', taille: 28 },
    { texte: '', taille: 20 },
    { texte: 'Schlussfolgerungen:', taille: 30, gras: true },
    { texte: '- Insulin glargin abends von 18 auf 16 IE reduzieren.', taille: 28 },
    { texte: '- Blutzuckerkontrolle um 3 Uhr an 7 Tagen.', taille: 28 },
    { texte: '- Spaete Zwischenmahlzeit vor dem Schlafengehen obligatorisch.', taille: 28 },
    { texte: '- Neue Visite in 10 Tagen mit dem Blutzuckerprotokoll.', taille: 28 },
    { texte: '', taille: 40 },
    { texte: '(Fiktives Demonstrationsdokument)', taille: 22 },
  ],
  join(racine, 'fichiers', 'compte-rendu-scanne.pdf'),
  { graine: 23 },
);
console.log('compte-rendu-scanne.pdf in data/fichiers/ geschrieben.');
