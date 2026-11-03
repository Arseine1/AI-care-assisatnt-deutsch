// Rapport de garde d'un résident (tâche d'étage) – ce qui est gardé dans la tâche : le BROUILLON, jamais une validation.
// Si la génération échoue pour ce résident, l'erreur est notée et les autres résidents continuent.
const e = $('Entrée').first().json;
const p = $('Chercher').first().json.patient;
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
  : { ...base, erreur: String(r.error?.message ?? r.error ?? 'Génération impossible').slice(0, 200) };
return [{ json: { task_id: e.task_id, entree } }];
