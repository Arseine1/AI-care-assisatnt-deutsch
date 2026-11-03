// Cotisations retraite – avancement de l'agent : statut, étapes ou tours déjà faits (journal) et, une fois terminé, le résultat.
const t = $input.first().json ?? {};
if (!t.id) throw new Error('Tâche introuvable');
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