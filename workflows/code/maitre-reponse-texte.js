// Réponse au front pour un texte rédigé par l'IA (Mode A et Mode B) : un BROUILLON, jamais une validation.
// Les alarmes de capteurs ne sont pas encore reliées à MQTT : « alertes » reste vide ici ; les contrôles
// automatiques de la réponse sortent dans « avertissements » (points à vérifier par le soignant).
const r = $input.first().json;
return [
  {
    json: {
      brouillon_id: r.brouillon_id,
      texte: r.texte,
      sources: r.sources ?? [],
      alertes: [],
      retirees: (r.retirees ?? []).map((x) => ({ phrase: x.phrase, source_id: x.source_id, motifs: x.motifs.map((m) => m.libelle), detail: x.detail })),
      avertissements: (r.avertissements ?? []).map((a) => ({ type: a.type, detail: String(a.detail ?? '').slice(0, 200) })),
    },
  },
];
