// Angezeigte Alarme – Antwort an die Oberfläche (die nicht quittierten Alarme der letzten 12 Stunden, der neueste zuerst).
const lignes = $input.all().map((i) => i.json).filter((r) => r.id);
return [
  {
    json: {
      alarmes: lignes.map((r) => ({
        id: r.id,
        recue_le: r.recue_le,
        chambre: r.chambre,
        type: r.type,
        libelle: r.libelle,
        faits: r.faits,
        contexte: r.contexte ?? { statut: 'aucun' },
        statut: r.statut ?? 'nouvelle',
        acquittee_le: r.acquittee_le ?? null,
      })),
    },
  },
];
