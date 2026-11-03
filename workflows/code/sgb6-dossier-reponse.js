// Rentenbeiträge – das zuletzt gespeicherte Ergebnis einer Akte, um es erneut anzusehen, ohne den Agenten neu zu starten.
const r = $input.first().json ?? {};
if (!r.id) return [{ json: { ok: false, erreur: 'inconnu' } }];
return [
  {
    json: {
      ok: true,
      id: r.id,
      aidant: r.aidant,
      personne_soignee: r.personne,
      recu_le: r.recu_le,
      statut: r.statut,
      revue: r.revue === true,
      resultat: r.resultat ?? null,
      derniere_decision: r.derniere_decision ?? null,
    },
  },
];
