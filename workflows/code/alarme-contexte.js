// Alarme de capteur – contexte de l'assistant IA prêt à être affiché (texte assemblé par le code, phrases non sourcées retirées).
const a = $('Créer l\'alarme').first().json;
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