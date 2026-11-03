// Cotisations retraite – le fichier déposé ressemble-t-il à un questionnaire ? (lecture par RÈGLES, jamais par l'IA)
// Il faut au moins la référence du dossier de la caisse et le nom de l'aidant. Un document suspect est accepté (l'agent le signalera).
const e = $input.first().json ?? {};
if (e.refus) return [{ json: e }];
const texte = String(e.texte ?? '').replace(/\r\n/g, '\n').trim();
if (texte.length < 30) return [{ json: { refus: 'vide', message: 'Le document ne contient pas de texte exploitable.' } }];
const { donnees, recu_le } = extraireChamps(texte);
if (!donnees.ref_caisse || !donnees.aidant_nom) {
  return [{ json: { refus: 'pas_un_questionnaire', message: "Ce document ne ressemble pas à un questionnaire de la caisse : référence du dossier ou nom de l'aidant introuvable." } }];
}
const nom = (p, n) => `${donnees[p] ?? ''} ${donnees[n] ?? ''}`.trim();
return [
  {
    json: {
      id: `dep-${require('crypto').randomBytes(5).toString('hex')}`,
      texte,
      aidant: nom('aidant_prenom', 'aidant_nom'),
      personne: nom('personne_prenom', 'personne_nom'),
      recu_le: recu_le ?? new Date().toISOString().slice(0, 10),
    },
  },
];