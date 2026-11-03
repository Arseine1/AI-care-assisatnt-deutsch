// Aligne la liste des résidents de l'interface (front/src/mock/residents.json)
// sur les données de test, pour que le sélecteur de chambre affiche les mêmes résidents.
// Les deux homonymes « Heinz Müller » sont distingués par la date de naissance.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { residents } from '../source/residents.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const liste = residents
  .map((r) => ({
    chambre: r.chambre,
    etage: r.etage,
    civilite: r.civilite,
    prenom: r.prenom,
    nom: r.nom,
    naissance: r.naissance,
  }))
  .sort((a, b) => Number(a.chambre) - Number(b.chambre));

writeFileSync(join(racine, 'front', 'src', 'mock', 'residents.json'), JSON.stringify(liste, null, 2) + '\n', 'utf8');
console.log(`front/src/mock/residents.json : ${liste.length} résidents.`);
