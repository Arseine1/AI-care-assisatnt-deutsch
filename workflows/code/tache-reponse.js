// Fortschritt einer Aufgabe – Antwort an die Oberfläche.
const demande = $('Aufgabe prüfen').first().json;
const t = $input.first().json ?? {};
if (!t.id) {
  if (demande.etage) return [{ json: { tache_id: null } }]; // « der letzte Bericht der Etage »: Es gibt keinen
  throw new Error('Aufgabe nicht gefunden');
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
