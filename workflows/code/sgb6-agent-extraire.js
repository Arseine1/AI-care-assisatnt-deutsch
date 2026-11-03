// Cotisations retraite, agent – étape 2 : extraire les champs PAR RÈGLES (lecture par l'IA non demandée).
const debut = Date.now();
const texte = $('Dossier').first().json.questionnaire;
const lu = extraireChamps(texte);
const n = Object.keys(lu.champs).filter((c) => c !== 'recu_le').length;
return [
  {
    json: {
      fait: 2,
      lu,
      lecture: { demande: false, utilise: false, repli: false, mode: 'regles', lus: n },
      journal: { etape: 'extraire', outil: 'extraireChamps (règles)', resultat: `${n} champ(s) extrait(s) par les règles`, duree_ms: Date.now() - debut },
    },
  },
];