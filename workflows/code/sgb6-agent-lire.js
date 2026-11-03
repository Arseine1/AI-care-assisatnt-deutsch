// Cotisations retraite, agent – étape 1 : lire le questionnaire (donnée brute) et repérer les consignes cachées (ignore, ignoriere, genehmige…).
// La ligne de journal ne contient que des comptes : jamais un nom ni un numéro d'assurance.
const debut = Date.now();
const d = $('Dossier').first().json;
if (!d.id) throw new Error('Dossier introuvable');
const texte = String(d.questionnaire ?? '');
const suspects = detecterSuspects(texte);
return [
  {
    json: {
      fait: 1,
      journal: { etape: 'lire', outil: 'lire_document', resultat: `document lu : ${texte.split('\n').length} ligne(s), ${suspects.length} passage(s) suspect(s) repéré(s)`, duree_ms: Date.now() - debut },
    },
  },
];