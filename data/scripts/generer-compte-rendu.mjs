// Génère data/fichiers/compte-rendu-scanne.pdf : compte rendu de visite du diabétologue,
// sous forme d'image (« scan ») pour tester l'OCR de l'étape 4. Données fictives.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerScan } from './lib/scan.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const jour = new Date().toLocaleDateString('fr-FR');

await creerScan(
  [
    { texte: 'Haus Sonnenhof - Compte rendu de visite medicale', taille: 32, gras: true },
    { texte: `Date : ${jour}`, taille: 26 },
    { texte: 'Residents concerne : M. Karl Becker, chambre 14, ne le 27.01.1939', taille: 26 },
    { texte: 'Medecin : Dr Elke Brandt, diabetologue', taille: 26 },
    { texte: '', taille: 24 },
    { texte: 'Motif : hypoglycemies nocturnes repetees (3 en 5 jours).', taille: 28 },
    { texte: '', taille: 20 },
    { texte: 'Conclusions :', taille: 30, gras: true },
    { texte: '- Reduire l\'insuline glargine de 18 a 16 UI le soir.', taille: 28 },
    { texte: '- Controle de la glycemie a 3 h pendant 7 jours.', taille: 28 },
    { texte: '- Collation tardive obligatoire au coucher.', taille: 28 },
    { texte: '- Nouvelle visite dans 10 jours avec le releve glycemique.', taille: 28 },
    { texte: '', taille: 40 },
    { texte: '(Document fictif de demonstration)', taille: 22 },
  ],
  join(racine, 'fichiers', 'compte-rendu-scanne.pdf'),
  { graine: 23 },
);
console.log('compte-rendu-scanne.pdf écrit dans data/fichiers/.');
