// Rentenbeiträge, Agent – Schritt 2: die Felder durch REGELN extrahieren (Lesen durch die KI nicht angefordert).
const debut = Date.now();
const texte = $('Akte').first().json.questionnaire;
const lu = extraireChamps(texte);
const n = Object.keys(lu.champs).filter((c) => c !== 'recu_le').length;
return [
  {
    json: {
      fait: 2,
      lu,
      lecture: { demande: false, utilise: false, repli: false, mode: 'regles', lus: n },
      journal: { etape: 'extraire', outil: 'extraireChamps (Regeln)', resultat: `${n} Feld(er) durch die Regeln extrahiert`, duree_ms: Date.now() - debut },
    },
  },
];
