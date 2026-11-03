// Rentenbeiträge – Fortschritt des Agenten: Status, bereits erledigte Schritte oder Runden (Protokoll) und, nach dem Ende, das Ergebnis.
const t = $input.first().json ?? {};
if (!t.id) throw new Error('Aufgabe nicht gefunden');
const termine = ['termine', 'termine_avec_erreurs'].includes(t.statut);
return [
  {
    json: {
      tache_id: t.id,
      dossier: t.dossier,
      pilote: t.pilote ?? 'guidee',
      statut: t.statut,
      fait: t.fait,
      total: t.total,
      etapes: t.etapes ?? [],
      resultat: termine && t.resultat && !Array.isArray(t.resultat) ? t.resultat : null,
    },
  },
];
