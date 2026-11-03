// Valider un rapport – réponse à l'interface : la validation, puis ce qui a suivi (RAG, transmission).
// La validation reste enregistrée même si l'étape suivante échoue : l'erreur est alors signalée, pas cachée.
const v = $('Enregistrer').first().json;
const a = $input.first().json ?? {};
return [
  {
    json: {
      ...v,
      apres_validation: a.error ? { erreur: String(a.error.message ?? a.error).slice(0, 200) } : { rag: a.rag, transmission: a.transmission },
    },
  },
];
