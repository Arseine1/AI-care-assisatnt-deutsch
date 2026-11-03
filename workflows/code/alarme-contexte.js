// Sensoralarm – Kontext des KI-Assistenten, anzeigebereit (vom Code zusammengesetzter Text, Sätze ohne Quelle entfernt).
const a = $('Alarm erstellen').first().json;
const r = $input.first().json ?? {};
const contexte = r.brouillon_id
  ? {
      statut: 'pret',
      texte: r.texte,
      sources: r.sources ?? [],
      avertissements: (r.avertissements ?? []).map((x) => ({ type: x.type, detail: String(x.detail ?? '').slice(0, 200) })),
      retirees: (r.retirees ?? []).map((x) => ({ phrase: x.phrase, source_id: x.source_id, motifs: x.motifs.map((m) => m.libelle), detail: x.detail })),
    }
  : { statut: 'indisponible' };
return [{ json: { id: a.id, contexte } }];
