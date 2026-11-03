// Avancement d'une tâche – réponse à l'interface.
const demande = $('Contrôler la tâche').first().json;
const t = $input.first().json ?? {};
if (!t.id) {
  if (demande.etage) return [{ json: { tache_id: null } }]; // « le dernier rapport de l'étage » : il n'y en a pas
  throw new Error('Tâche introuvable');
}
return [
  {
    json: {
      tache_id: t.id,
      type: t.type,
      statut: t.statut,
      total: t.total,
      fait: t.fait,
      automatique: t.parametres?.automatique === true,
      cree_le: t.cree_le,
      resultat: t.resultat ?? [],
    },
  },
];
