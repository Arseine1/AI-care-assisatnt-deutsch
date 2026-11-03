// Baustein „Verfassen“ – an den Aufrufer zurückgegebenes Ergebnis: der Entwurf (niemals eine Bestätigung).
const ctx = $('Aufruf vorbereiten').first().json;
const c = $('Antwort prüfen').first().json;
const b = $('Entwurf erstellen').first().json;
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
