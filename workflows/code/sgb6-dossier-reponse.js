// Cotisations retraite – le dernier résultat enregistré d'un dossier, pour le revoir sans relancer l'agent.
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