// Dienstbericht eines Bewohners (Etagenaufgabe) – was in der Aufgabe aufbewahrt wird: der ENTWURF, nie eine Bestätigung.
// Schlägt die Erstellung für diesen Bewohner fehl, wird der Fehler vermerkt und die übrigen Bewohner werden weiter bearbeitet.
const e = $('Eingang').first().json;
const p = $('Suchen').first().json.patient;
const r = $input.first().json ?? {};
const base = { patient_id: p.patient_id, chambre: p.chambre, resident: p.label };
const entree = r.brouillon_id
  ? {
      ...base,
      brouillon_id: r.brouillon_id,
      texte: r.texte,
      sources: r.sources ?? [],
      retirees: (r.retirees ?? []).map((x) => ({ phrase: x.phrase, source_id: x.source_id, motifs: x.motifs.map((m) => m.libelle), detail: x.detail })),
      avertissements: (r.avertissements ?? []).map((a) => ({ type: a.type, detail: String(a.detail ?? '').slice(0, 200) })),
    }
  : { ...base, erreur: String(r.error?.message ?? r.error ?? 'Erstellung nicht möglich').slice(0, 200) };
return [{ json: { task_id: e.task_id, entree } }];
