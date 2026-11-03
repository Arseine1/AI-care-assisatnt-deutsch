// Brique « rédiger » – résultat renvoyé à l'appelant : le brouillon (jamais une validation).
const ctx = $('Préparer appel').first().json;
const c = $('Contrôler la réponse').first().json;
const b = $('Créer le brouillon').first().json;
return [
  {
    json: {
      brouillon_id: b.id,
      texte: c.texte,
      avertissements: c.avertissements,
      retirees: c.retirees ?? [],
      patient: ctx.patient,
      mode: ctx.mode ?? 'a',
      action: ctx.action ?? ctx.prompt_id,
      prompt_id: ctx.prompt_id,
      prompt_version: ctx.prompt_version,
      modele: c.modele,
      duree_ms: c.duree_ms,
      tokens: c.tokens,
      sources: [...new Set(ctx.faits.map((f) => f.label))],
      faits: ctx.faits.map((f) => ({ id: f.id, label: f.label, texte: f.texte, date: f.date, ref: f.ref })),
    },
  },
];
