// Vérifier le document – aucune lettre en attente : réponse sans brouillon (rien à valider).
return [
  {
    json: {
      brouillon_id: null,
      texte: 'information non disponible : aucune lettre de médecin n\'est en attente de vérification pour ce résident. [KIM (lettre de médecin)]',
      sources: ['KIM (lettre de médecin)'],
      alertes: [],
      avertissements: [],
    },
  },
];
